/**
 * 宠物面板 —— 点吉祥物弹出来的那一小块。
 *
 * 之前吉祥物是**死的**：整个覆盖层 `pointer-events: none`，点它没有任何反应。
 * 一个产品的脸面不可交互，是体验上最刺眼的一种。
 *
 * 这里给它：改名 / 换配色 / 换形象 / 让它重讲一遍 / 让它安静（TTS）。
 * 全部写回 Y.Doc 的 pet root，所以换台设备也是你的那只。
 */
import { readPet, setActivePet, upsertPet, type PetSpec } from "@lingrui/knowledge";
import { ydoc } from "../collab/doc";
import { getPlayerState, player } from "../state/player";
import { setTtsEnabled, ttsEnabled } from "../timeline/tts";

/** 预设配色：[轮廓, 身体, 肚子, 点缀, 白] */
const PALETTES: Array<{ name: string; palette: string[] }> = [
  { name: "珊瑚", palette: ["#1e1e1e", "#e8836a", "#f3b39e", "#3b3b3b", "#ffffff"] },
  { name: "靛蓝", palette: ["#141a2e", "#5b8def", "#9dc0ff", "#2b3556", "#ffffff"] },
  { name: "苔绿", palette: ["#16241c", "#5aa469", "#a8d5b0", "#2f4636", "#ffffff"] },
  { name: "藕紫", palette: ["#241a2e", "#a06cd5", "#d2b3f0", "#3d2b4f", "#ffffff"] },
  { name: "沙金", palette: ["#2b2317", "#d9a441", "#f0d59a", "#4a3d26", "#ffffff"] },
];

export function PetPanel({ pet, onClose }: { pet: PetSpec; onClose: () => void }) {
  const patch = (next: Partial<PetSpec>) => {
    const fresh = readPet(ydoc, pet.id);
    if (!fresh) return;
    upsertPet(ydoc, { ...fresh, ...next });
    setActivePet(ydoc, pet.id);
  };

  const setPalette = (palette: string[]) => {
    // 只有像素形态有调色板；其它形态忽略（面板本身也只给 pixel 显示）
    if (pet.avatar.kind !== "pixel") return;
    patch({ avatar: { ...pet.avatar, palette } });
  };

  const reshuffle = () => {
    if (pet.avatar.kind !== "pixel") return;
    patch({ avatar: { ...pet.avatar, seed: Math.floor(Math.random() * 1000) } });
  };

  const canReplay = Boolean(getPlayerState().script);

  return (
    <div className="pet-panel" onClick={(e) => e.stopPropagation()}>
      <div className="pet-panel-head">
        <span className="pet-panel-title">{pet.name}</span>
        <button type="button" className="nd-close" aria-label="关闭" onClick={onClose}>
          ✕
        </button>
      </div>

      <label className="pet-field">
        <span>名字</span>
        <input
          value={pet.name}
          aria-label="宠物名字"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>

      <div className="pet-field">
        <span>配色</span>
        <div className="pet-swatches">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              type="button"
              className="pet-swatch"
              title={p.name}
              style={{ background: p.palette[1], borderColor: p.palette[0] }}
              onClick={() => setPalette(p.palette)}
            />
          ))}
          <button type="button" className="pet-swatch pet-swatch-shuffle" title="换一个形象" onClick={reshuffle}>
            ⟳
          </button>
        </div>
      </div>

      <div className="pet-actions">
        <button
          type="button"
          className="view-chip"
          disabled={!canReplay}
          title={canReplay ? "从头再演一遍" : "还没有演出"}
          onClick={() => {
            player.replay();
            onClose();
          }}
        >
          ▶ 重讲一遍
        </button>
        <button
          type="button"
          className={`view-chip${ttsEnabled() ? " active" : ""}`}
          onClick={() => setTtsEnabled(!ttsEnabled())}
        >
          {ttsEnabled() ? "🔊 朗读中" : "🔈 朗读"}
        </button>
      </div>
    </div>
  );
}
