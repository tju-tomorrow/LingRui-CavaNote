import { describe, expect, test } from "bun:test";
import { ChatApiError } from "./remote";
import { remoteFailureNotice } from "./notice";

describe("remoteFailureNotice", () => {
  test("401 指向「需要登录」而不是笼统的失败", () => {
    expect(remoteFailureNotice(new ChatApiError("x", 401))).toContain("登录");
  });

  test("403 指向 token 不匹配", () => {
    expect(remoteFailureNotice(new ChatApiError("x", 403))).toContain("token");
  });

  test("503 指向服务端未配置 LLM", () => {
    expect(remoteFailureNotice(new ChatApiError("x", 503))).toContain("OPENAI_API_KEY");
  });

  test("其它 HTTP 状态码带上数字", () => {
    expect(remoteFailureNotice(new ChatApiError("x", 502))).toContain("502");
  });

  test("非 HTTP 错误（网络 / 服务没起）有兜底提示", () => {
    expect(remoteFailureNotice(new TypeError("Failed to fetch"))).toContain("连不上");
  });
});
