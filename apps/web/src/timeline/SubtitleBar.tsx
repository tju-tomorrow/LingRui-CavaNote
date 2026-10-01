/**
 * 旁白字幕条 —— 演出时把「现在在讲什么」放大到看得清。
 *
 * 之前旁白只在宠物旁边一个小气泡里（12px / 240px 宽），
 * 投影、录屏、甚至正常看都读不了。这里放到画布底部，大字、居中、有节点名。
 *
 * 顺带在这里驱动 TTS（同一份 narration，避免两处各订阅一遍）。
 */
import { useEffect, useRef } from "react";
import { useKnowledgeNodes } from "../collab/useKnowledge";
import { usePlayer } from "../state/player";
import { speak, stopSpeaking, useTtsEnabled } from "./tts";

export function SubtitleBar() {
  const { snapshot, playing, script } = usePlayer();
  const nodes = useKnowledgeNodes();
  const tts = useTtsEnabled();

  const narration = snapshot?.narration ?? null;
  const text = narration?.text ?? "";
  const nodeTitle = narration?.nodeId
    ? (nodes.find((n) => n.id === narration.nodeId)?.title ?? null)
    : null;

  // 只在「演出进行中」显示：没开始 / 暂停久了就别占着画面
  const visible = Boolean(script) && Boolean(text);

  // 朗读：旁白换了才说；暂停就闭嘴
  const lastSpoken = useRef<string>("");
  useEffect(() => {
    if (!tts) return;
    if (!playing || !text) {
      stopSpeaking();
      return;
    }
    if (text === lastSpoken.current) return;
    lastSpoken.current = text;
    speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在旁白/播放态变化时跑
  }, [text, playing, tts]);

  // 组件卸载（切视图等）时闭嘴
  useEffect(() => () => stopSpeaking(), []);

  if (!visible) return null;

  return (
    <div className="subtitle-bar" role="status" aria-live="polite">
      {nodeTitle ? <span className="subtitle-node">{nodeTitle}</span> : null}
      <span className="subtitle-text">{text}</span>
    </div>
  );
}
