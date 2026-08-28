// Local Supabase stack defaults (see `npx supabase status`).
export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  sitePublicUrl: 'http://localhost:4202',
  appPublicUrl: 'http://localhost:4203',
  storefrontPublicUrl: 'http://localhost:4204',
  marketingVideoBaseUrl: '',
  gitbookSiteUrl: 'https://dukarun.gitbook.io/docs',
  usertourToken: 'cmtc4ejtu01yw72cdf7nfwhil',
  usertourContentIds: {
    'creating-a-product': 'cmtc5qcow02c572cdldtbl7d8',
    'generating-product-barcodes': 'cmtc5qs7z02ca72cdskz46ynv',
    'creating-a-supplier': 'cmtc5qt4v026ku14oolhncw01',
    'recording-a-credit-purchase': 'cmtc5qttm02cg72cdubbspg3c',
    'making-a-cash-sale': 'cmtc5quih026pu14oun4n8kqx',
    'selling-by-scanning-a-barcode': 'cmtc5qva002cx72cd1bnkvswi',
    'creating-a-customer-with-credit': 'cmtc5qvx5026vu14o768c7zps',
    'making-a-credit-sale': 'cmtc5qwni0270u14ozmiyln6l',
    'understanding-the-financial-result': 'cmtc5qxh2027au14o7p1kvq29',
    'first-business-cycle': 'cmtc5v7mm028tu14omfxzifaq',
  } as Record<string, string>,
  publicDataMode: 'fixture' as 'fixture' | 'live',
};
