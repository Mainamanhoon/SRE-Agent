import { createHash, timingSafeEqual } from "node:crypto";
import { RequestAuthenticator } from "../contracts/request-authenticator.js";

export class BearerTokenRequestAuthenticatorV1 extends RequestAuthenticator {
  public constructor(
    private readonly enabled: boolean,
    expectedTokens: string | readonly string[],
  ) {
    super();
    this.expectedDigests = (typeof expectedTokens === "string" ? [expectedTokens] : expectedTokens)
      .filter((token, index, tokens) => token.length > 0 && tokens.indexOf(token) === index)
      .map(digest);
  }

  private readonly expectedDigests: readonly Buffer[];

  public override authenticate(authorizationHeader?: string): boolean {
    if (!this.enabled) return true;
    if (!authorizationHeader?.startsWith("Bearer ")) return false;
    const actual = digest(authorizationHeader.slice(7));
    let matched = 0;
    for (const expected of this.expectedDigests) {
      matched |= Number(timingSafeEqual(actual, expected));
    }
    return matched === 1;
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
