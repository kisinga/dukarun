# Printing and WhatsApp documents

**Print settings** remembers the document size and printer method on this device.
Choose **52 mm** for a 57/58 mm receipt roll, **80 mm** for a wide roll, or **A4**.
The size remains editable. Each new WhatsApp send uses the current selection:
A4 produces an A4 PDF; either receipt size produces a readable 80 mm mobile PDF.
Older documents use the current renderer and default to A4 when their format is absent.

## Android and Open ESC

On Android Chrome/PWAs, choose **Open ESC** once in Print settings. Install
[Open ESC/POS print service](https://play.google.com/store/apps/details?id=com.farminos.print),
pair the printer, and choose it as Open ESC's default printer. This integration uses Android
intents and does not require Chrome 138's Bluetooth Web Serial support.

Content prepares before the Print tap. The tap opens Open ESC directly, without another
Dukarun confirmation. A spinner indicates preparation. Errors offer manual preparation retry
or system printing. A4 documents and fixed-page reports continue through system printing.
Desktop retains its document-size choices and does not show Open ESC.

Use the actual DPI and printable width in Open ESC, with zero side margins. Its width is in
centimetres: 5.0 means 50 mm. Confirm the printable head width from the printer's self-test;
paper width and printable width can differ. During calibration, set the bottom margin to zero.
Choose **Test receipt** and verify both LEFT and RIGHT, all 40 lines, and END. Then print a real
receipt with long names, large totals, a logo, and a QR code. Scan the printed QR.

Browser layout tests cannot prove physical printer output. Change receipt margins only when
an actual layout defect is reproduced; use calibration to identify printer configuration issues.

## Barcode labels

Label layout and barcode direction are saved separately from receipt size. Individual labels,
packs, selections, copies, and catalogue batches use the same printer preference.
A4 grids use system printing; roll layouts can use Open ESC.

**Label direction** defaults to Automatic: a roll batch stays Standard when every barcode fits,
and rotates 90° when any barcode needs more width. Rotation turns text and barcode together
and uses longer labels on continuous paper. Choose Standard or Rotate 90° to override it;
that explicit choice stays saved. An explicit Standard choice warns if the bars cannot fit
readably. A4 grids retain their fixed standard direction.

Under the optional **Thermal print quality** settings, match the width and DPI configured in
Open ESC. Defaults match the initial 5.0 cm / 203 DPI setup. The driver bitmap width determines
barcode and QR sizing, including its rounding to whole dots. SVG module sizing accounts for the encoder's
two SVG units per narrow bar, keeps quiet zones, and avoids fractional module scaling.

Each roll label is one HTML page in a single handoff. Batches are bounded by 500 labels and
actual payload size. Printing the next batch requires a deliberate tap. Progress reports handoff,
not confirmed physical printing.

## Transport

Browser-only utilities are shared by merchant and public document views. Server PDF rendering
has no browser transport dependencies. Jobs carry explicit output geometry and capability metadata.

Open ESC receives a UTF-8 JSON array of HTML pages, gzipped and base64 encoded into a targeted
Android intent. Limits are 512 KiB before compression and 128 KiB for the final intent. Logos
are embedded as small monochrome PNGs, and QR geometry is preserved. Async preparation never
launches an app automatically. The Play Store is the fallback when Open ESC is unavailable.

There is no print-completion callback. Handoffs never trigger automatic retries.
[Open ESC protocol documentation](https://github.com/farminos/open-escpos-print-service#using-through-an-intent).
