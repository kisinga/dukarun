// Apollo Client 4.2+ requires application-wide `defaultOptions` values to be
// registered here for type safety — otherwise it brands any undeclared value
// (e.g. `errorPolicy: 'all'`) and the config in core/services/apollo.service.ts
// fails to compile.
//
// The declarations are intentionally OPTIONAL (`errorPolicy?`). Declaring them
// as required would make `defaultOptions` mandatory on every `new ApolloClient`
// call (breaking constructions that omit it, e.g. the test mock) and would flip
// all methods/hooks to the "modern" signature, which forbids the manually-passed
// generics this codebase uses at ~140 call sites. Optional declarations remove
// the brand while preserving the classic, pre-4.2 typing the codebase relies on.
import '@apollo/client';

declare module '@apollo/client' {
  namespace ApolloClient {
    namespace DeclareDefaultOptions {
      interface WatchQuery {
        errorPolicy?: 'all';
      }
      interface Query {
        errorPolicy?: 'all';
      }
      interface Mutate {
        errorPolicy?: 'all';
      }
    }
  }
}
