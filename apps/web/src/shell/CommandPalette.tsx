/**
 * 命令面板（⌘K）（PRD/主界面.md §2.1、§5.6、ADR-0007）
 *
 * **跨笔记**全文检索：一次索引「所有笔记的正文 + 全部知识节点」。
 * 这正是「知识是全局的、笔记是多份的」在搜索上的体现 ——
 * 你可以在一篇笔记里搜到另一篇笔记的正文，也能搜到任意节点。
 *
 * 结果按类型分组（笔记 / 知识节点），动作不同：
 *   笔记 → 切换过去；节点 → 聚焦（画布高亮 + 文档滚动 + 详情卡）
 *
 * ⚠️ Orama 默认分词器把非 ASCII（汉字）当分隔符**直接丢弃**，中文完全搜不到。
 * 所以传一个 **CJK tokenizer**：拉丁词照常切，CJK 连续片段切成「单字 + 双字(bigram)」，
 * 从而支持「雪崩」这类中文子串检索。文档与查询共用同一个 tokenizer。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { create, insertMultiple, search } from "@orama/orama";
import { noteText, type KnowledgeNode, type NoteMeta } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { useKnowledgeNodes, useKnowledgeNotes } from "../collab/useKnowledge";
import { setFocus } from "../state/focus";
import { setActiveNote } from "../state/notes";
import { jevRerank } from "../chat/systemone";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

type HitType = "note" | "node";

interface Hit {
  id: string;
  type: HitType;
  kind: string;
  title: string;
  summary: string;
}

/** CJK 友好的 tokenizer：拉丁词 + 汉字单字 + 汉字双字 */
const cjkTokenizer = {
  language: "cjk",
  normalizationCache: new Map<string, string>(),
  tokenize(raw: string): string[] {
    const out: string[] = [];
    for (const w of raw.toLowerCase().match(/[a-z0-9_'-]+/g) ?? []) out.push(w);
    for (const run of raw.match(/[\u4e00-\u9fff]+/g) ?? []) {
      for (let i = 0; i < run.length; i++) out.push(run[i]!);
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    }
    return out;
  },
};

function nodeText(n: KnowledgeNode): string {
  const tech = Array.isArray(n.meta?.["tech"]) ? (n.meta["tech"] as string[]) : [];
  return [
    n.title,
    n.summary ?? "",
    n.kind,
    ...(n.roles ?? []),
    ...(n.faq ?? []).flatMap((f) => [f.q, f.a ?? ""]),
    ...(n.tags ?? []),
    ...tech,
  ].join(" ");
}

function makeIndex(nodes: KnowledgeNode[], notes: NoteMeta[]) {
  const db = create({
    schema: {
      id: "string",
      type: "string",
      kind: "string",
      title: "string",
      summary: "string",
      text: "string",
    },
    components: { tokenizer: cjkTokenizer },
  });

  insertMultiple(db, [
    ...nodes.map((n) => ({
      id: n.id,
      type: "node",
      kind: n.kind,
      title: n.title,
      summary: n.summary ?? "",
      text: nodeText(n),
    })),
    ...notes.map((note) => {
      const body = noteText(ydoc, note);
      return {
        id: note.id,
        type: "note",
        kind: "note",
        title: note.title,
        summary: body.slice(0, 60),
        text: `${note.title} ${body}`,
      };
    }),
  ]);

  return db;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nodes = useKnowledgeNodes();
  const notes = useKnowledgeNotes();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const db = useMemo(() => makeIndex(nodes, notes), [nodes, notes]);

  useEffect(() => {
    const kw = q.trim();
    let cancelled = false;

    const fallback = (): Hit[] => [
      ...notes.slice(0, 4).map((n) => ({
        id: n.id,
        type: "note" as const,
        kind: "note",
        title: n.title,
        summary: noteText(ydoc, n).slice(0, 50),
      })),
      ...nodes.slice(0, 6).map((n) => ({
        id: n.id,
        type: "node" as const,
        kind: n.kind,
        title: n.title,
        summary: n.summary ?? "",
      })),
    ];

    if (!kw) {
      setResults(fallback());
      return;
    }

    void (async () => {
      const res = await search(db, { term: kw, limit: 12, properties: ["text", "title"] });
      if (cancelled) return;
      let hits = res.hits.map((h) => h.document as unknown as Hit);
      // Jev 精排：用 noul 概率重排（threshold 0 = 只重排不过滤，
      // 别把用户明确搜的词藏起来）。未配 key / 失败 → null，保留 Orama 顺序。
      const reranked = await jevRerank(kw, hits, (h) => `${h.title} ${h.summary} ${h.kind}`, {
        threshold: 0,
      });
      if (cancelled) return;
      if (reranked) hits = reranked.map((r) => r.item);
      setResults(hits);
    })();

    return () => {
      cancelled = true;
    };
  }, [db, q, nodes, notes]);

  const pick = (hit: Hit) => {
    if (hit.type === "note") setActiveNote(hit.id);
    else setFocus(hit.id);
    onClose();
  };

  const groups: Array<{ label: string; type: HitType }> = [
    { label: "笔记", type: "note" },
    { label: "知识节点", type: "node" },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <Input
          ref={inputRef}
          className="h-12 rounded-none border-0 border-b px-4 text-[15px] shadow-none focus-visible:ring-0"
          placeholder="搜索笔记、知识节点…（跨全部笔记）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0]);
          }}
        />
        <ul className="max-h-[46vh] overflow-auto p-2">
          {groups.map((group) => {
            const items = results.filter((r) => r.type === group.type);
            if (items.length === 0) return null;
            return (
              <li key={group.type}>
                <div className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                <ul>
                  {items.map((r) => (
                    <li key={`${r.type}-${r.id}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition hover:bg-accent"
                        onClick={() => pick(r)}
                      >
                        <Badge variant="muted" className="shrink-0 text-[10px]">
                          {r.kind}
                        </Badge>
                        <span className="shrink-0 font-medium">{r.title}</span>
                        <span className="truncate text-muted-foreground">{r.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {results.length === 0 ? (
            <li className="p-4 text-[13px] text-muted-foreground">没有匹配的内容</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
