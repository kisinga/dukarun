import type { CodegenConfig } from '@graphql-codegen/cli';

// Public storefront targets the Vendure SHOP API (backend must be running for codegen).
const schemaUrl = 'http://localhost:3000/shop-api';

const config: CodegenConfig = {
  overwrite: true,
  schema: schemaUrl,
  config: {
    scalars: { Money: 'number' },
    namingConvention: { enumValues: 'keep' },
    avoidOptionals: {
      field: false,
      inputValue: false,
      object: false,
    },
  },
  generates: {
    'src/app/core/graphql/generated/': {
      preset: 'client',
      documents: [
        'src/app/**/*.ts',
        'src/app/**/*.graphql.ts',
        '!src/app/core/graphql/generated/**/*',
      ],
      presetConfig: {
        fragmentMasking: false,
      },
    },
  },
};

export default config;
