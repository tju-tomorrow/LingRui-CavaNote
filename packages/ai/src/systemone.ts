/**
 * System One（TypeSafe / Jev）—— 决策模型客户端
 *
 * 它和「生成模型」是两种东西：Jev **只回答「是不是 / 多少 / 哪一个」**，
 * 回的是**带概率的标签**，不产出任何文本 —— 所以没有东西需要解析，
 * 代码直接按概率决定信不信、留不留、往哪走。
 *
 * 三个原语：
 *   noul   （是不是）   → { noul: 0–1 }，校准过的「是」的概率
 *   choice （选一个）   → { choice, confidence, probabilities }
 *   score  （有序打分） → { score, confidence, legend, probabilities }
 *
 * 一次调用可以带**很多问题**：它们并行且互相隔离，加问题几乎不涨延迟。
 * 所以「想探索的维度」可以一次全带上，再由代码按 confidence 决定信不信。
 *
 * 本模块只做「发问题 / 收答案」，不预设任何业务问题（业务问题由调用方组织）。
 * 失败一律抛错，调用方必须 fail-open：拿不到决策就退回原行为，
 * **绝不因为外部模型挂了就让检索 / 讲解变成不可用**。
 */

export const DEFAULT_SYSTEMONE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_SYSTEMONE_MODEL = "jev-latest";

/** state / instructions / criteria 的叶子：纯文本，或结构化 JSON。 */
export type SystemOneValue = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: "noul";
  instructions: SystemOneValue;
  criteria?: { true?: SystemOneValue; false?: SystemOneValue };
}

export interface ChoiceQuestion {
  type: "choice";
  instructions: SystemOneValue;
  /** 选项 → 说明；最多 255 个。选项不需要额外说明时填 null。 */
  criteria: Record<string, SystemOneValue | null>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: SystemOneValue;
  /** 有序档位描述，2–10 档；答案的 legend 会按同样的下标回填。 */
  criteria: SystemOneValue[];
}

export type SystemOneQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}
export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
}
export type SystemOneAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneResult<Q extends Record<string, SystemOneQuestion>> {
  model: string;
  /** 与传入的 questions 同 key。 */
  answers: { [K in keyof Q]: SystemOneAnswer };
  usage: { inputTokens: number; outputTokens: number };
}

export interface AskSystemOneOptions {
  /** 完整的 POST 地址；浏览器走 /api/systemone 代理，node 可直接打 TypeSafe。 */
  endpoint: string;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 额外请求头（例如代理要求的登录 token / 本地一次性 token） */
  headers?: Record<string, string>;
}

/**
 * 问一组问题，拿一组答案。
 *
 * 多个问题在同一次调用里并行且互相隔离，所以「加维度」几乎不涨延迟。
 */
export async function askSystemOne<Q extends Record<string, SystemOneQuestion>>(
  state: SystemOneValue,
  questions: Q,
  options: AskSystemOneOptions,
): Promise<SystemOneResult<Q>> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  const headers: Record<string, string> = { ...options.headers, "content-type": "application/json" };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

  const response = await fetch(options.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state,
      model: options.model ?? DEFAULT_SYSTEMONE_MODEL,
      questions,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`System One ${response.status} ${options.endpoint}: ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    model?: string;
    answers?: Record<string, SystemOneAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  return {
    model: json.model ?? options.model ?? DEFAULT_SYSTEMONE_MODEL,
    answers: (json.answers ?? {}) as { [K in keyof Q]: SystemOneAnswer },
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* noul 重排：一次调用，一个候选一个问题 —— 检索的精排闸门             */
/* ------------------------------------------------------------------ */

export interface RankedByNoul<T> {
  item: T;
  noul: number;
}

/** 组装「检索意图 + 候选列表 + 每个候选一个 noul 问题」的载荷 */
export function buildNoulRerank<T>(
  query: string,
  pool: readonly T[],
  excerptOf: (item: T) => string,
  instructions: (index: number) => SystemOneValue,
  header = "# 检索意图",
): { state: string; questions: Record<string, NoulQuestion> } {
  const state = [
    header,
    query.trim(),
    "",
    "# 候选",
    ...pool.map((item, i) => `[c${i}] ${excerptOf(item)}`),
  ].join("\n");

  const questions: Record<string, NoulQuestion> = {};
  for (let i = 0; i < pool.length; i++) {
    questions[`c${i}`] = { type: "noul", instructions: instructions(i) };
  }
  return { state, questions };
}

/**
 * 按 noul 概率过滤再降序。
 *
 * 低于阈值的一条不留 —— 全是垃圾时返回**空数组**，而不是硬凑满 N 条。
 * （`noul` 是校准过的「是不是」，低于它宁可一条不给。）
 */
export function applyNoulRank<T>(
  pool: readonly T[],
  answers: Record<string, SystemOneAnswer>,
  threshold = 0.5,
): Array<RankedByNoul<T>> {
  const kept: Array<{ item: T; noul: number }> = [];
  for (let i = 0; i < pool.length; i++) {
    const answer = answers[`c${i}`];
    if (answer?.type !== "noul" || answer.noul < threshold) continue;
    kept.push({ item: pool[i]!, noul: answer.noul });
  }
  kept.sort((a, b) => b.noul - a.noul);
  return kept;
}

/** 注入式 transport：便于测试，也让浏览器 / node 各自决定怎么发请求 */
export type SystemOneAsk = (
  state: SystemOneValue,
  questions: Record<string, SystemOneQuestion>,
  signal?: AbortSignal,
) => Promise<Pick<SystemOneResult<Record<string, SystemOneQuestion>>, "answers">>;

/**
 * 用 Jev 对一批候选做精排。
 *
 * @returns 排好序的候选（可能为空数组）；**失败 / 没配 key 返回 null**，
 *          调用方原样用底层顺序 —— 外部依赖不能把检索变成不可用。
 */
export async function rerankByNoul<T>(
  query: string,
  pool: readonly T[],
  excerptOf: (item: T) => string,
  ask: SystemOneAsk,
  options: { threshold?: number; signal?: AbortSignal; instructions?: (index: number) => SystemOneValue } = {},
): Promise<Array<RankedByNoul<T>> | null> {
  if (pool.length === 0) return null;

  const { state, questions } = buildNoulRerank(
    query,
    pool,
    excerptOf,
    options.instructions ??
      ((i) => `候选项 [c${i}] 与上面的检索意图相关吗（真的能帮上忙才答是）`),
  );

  try {
    const res = await ask(state, questions, options.signal);
    return applyNoulRank(pool, res.answers, options.threshold ?? 0.5);
  } catch {
    return null;
  }
}
