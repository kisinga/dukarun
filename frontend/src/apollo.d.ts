// Apollo Client 4.2+ type configuration for this app.
//
// 1) defaultOptions registration: ApolloService sets `errorPolicy: 'all'` as the
//    default for watchQuery/query/mutate. AC 4.2 brands undeclared default-option
//    values, so they must be registered in `DeclareDefaultOptions` for the config
//    in shared/services/apollo.service.ts to type-check. They are declared OPTIONAL
//    so `defaultOptions` stays optional on `new ApolloClient` (the test mock omits
//    it) while still removing the brand.
//
// 2) signatureStyle: 'modern' — query/mutate/watchQuery infer Data/Variables from
//    the TypedDocumentNode and FORBID manually-passed generics. Every call site was
//    migrated to inference, so this ENFORCES it: a manual generic (e.g.
//    `client.query<X>(...)`) or a document cast that strips typing is now a compile
//    error, preventing regressions. Under modern signatures `result.data` is
//    accurately typed `TData | undefined` (because the default errorPolicy is 'all').
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

  interface TypeOverrides {
    signatureStyle: 'modern';
  }
}
