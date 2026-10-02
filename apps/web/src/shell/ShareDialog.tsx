/**
 * 分享链接弹层。
 *
 * 为什么需要它：`navigator.clipboard` 在没有 user activation / 非安全上下文时会拒绝，
 * 而原来的兜底只是弹一句「复制失败，请手动复制地址栏」——**地址栏里根本没有这个链接**
 * （它是带 `#share=` 的 URL），用户照着做只会更困惑。
 * 所以失败时直接把链接摆出来、自动选中，让用户按 ⌘C。
 */
import { useEffect, useRef, useState } from "react";
import { shareUrl } from "./share";

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const url = shareUrl();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 再试一次「选中 + execCommand」这条老路
      inputRef.current?.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="分享">
      <div className="lr-modal-backdrop" onClick={onClose} />
      <div className="lr-modal-card">
        <h3>分享</h3>
        <p className="lr-modal-hint">
          这个链接打开后是**只读视图**：能看画布与文档，不能提问、不能修改。
          <br />
          （当前是本机地址，换机器需要把协同服务部署出去。）
        </p>
        <input ref={inputRef} className="share-url" readOnly value={url} aria-label="分享链接" />
        <div className="lr-modal-actions">
          <button type="button" className="lr-btn-ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="lr-btn-primary" onClick={() => void copy()}>
            {copied ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
      </div>
    </div>
  );
}
