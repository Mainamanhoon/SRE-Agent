import { timingSafeEqual } from "node:crypto";
import { RequestAuthenticator } from "../contracts/request-authenticator.js";

export class BearerTokenRequestAuthenticatorV1 extends RequestAuthenticator {
  public constructor(
    private readonly enabled: boolean,
    private readonly expectedToken: string,
  ) {
    super();
  }

  public override authenticate(authorizationHeader?: string): boolean {
    if (!this.enabled) {
      return true;
    }
    if (!authorizationHeader?.startsWith("Bearer ")) {
      return false;
    }
    const actual = Buffer.from(authorizationHeader.slice("Bearer ".length), "utf8");
    const expected = Buffer.from(this.expectedToken, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
