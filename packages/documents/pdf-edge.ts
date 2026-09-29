// Bundled with its dependencies and fonts by scripts/build-document-edge.mjs.
import regular from './fonts/NotoSans-Regular.ttf';
import bold from './fonts/NotoSans-Bold.ttf';
import serif from './fonts/NotoSerif-Regular.ttf';
import { renderDocumentPdf, PDF_RENDERER_VERSION, type PdfAssets } from './pdf';
import { externalDocumentContent, type ExternalDocumentInput } from './adapters';
import type { DocumentIdentity } from './render';
export { preparePdfLogo } from './logo';
export { MAX_LOGO_BYTES } from './svg-logo';

export async function renderSnapshotPdf(
  snapshot: ExternalDocumentInput & { pdf_renderer_version?: number },
  identity: DocumentIdentity,
  logo?: PdfAssets['logo']
): Promise<Uint8Array> {
  if (snapshot.pdf_renderer_version !== PDF_RENDERER_VERSION)
    throw new Error('unsupported_renderer_version');
  return renderDocumentPdf(externalDocumentContent(snapshot, identity), snapshot.document_design, {
    regular,
    bold,
    serif,
    logo,
  });
}
