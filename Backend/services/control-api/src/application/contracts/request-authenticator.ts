export abstract class RequestAuthenticator {
  public abstract authenticate(authorizationHeader?: string): boolean;
}
