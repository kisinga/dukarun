# Barcode hardware setup

DukaRun supports USB scanners that operate as keyboards and label printers installed through the
device's normal print settings. No scanner driver or browser hardware permission is required.

## USB scanner

1. Connect the scanner and set it to **USB HID keyboard** mode.
2. Configure its suffix as **Enter**. A fast Tab suffix also works.
3. Open **POS → Sell**, then scan a known product.
4. A successful scan adds one unit and plays a short confirmation sound.

Scans work from the product search or any non-text control on the Sell screen. DukaRun leaves
customer, quantity, price, and payment fields alone while they are being edited.

If a scan fails:

- Confirm the barcode appears on the product's active variant.
- Confirm the scanner types the complete value, including leading zeroes.
- Remove duplicate barcodes reported on the Products page.
- When offline, refresh the catalogue after reconnecting if DukaRun says the cache is incomplete.

## Barcode printer

DukaRun supports these fixed layouts:

- **80 mm roll:** 80 × 40 mm
- **58 mm roll:** 58 × 30 mm
- **Compact roll:** 50 × 30 mm
- **A4 sheet:** 3 columns × 7 rows

Barcodes are sized so each bar spans a whole number of printer dots (203 dpi), which keeps
thermal output crisp and scannable. Very long codes that cannot fit at the minimum module width
are scaled down to fit the label as a best effort.

1. Install the printer using its operating-system driver.
2. Open **Products → Print labels**.
3. Choose one supported layout and select **Print test label**.
4. In the system print dialog, choose the same paper size, 100% scale, portrait orientation, and
   no extra margins or headers.
5. Print ready catalogue labels after the test label scans correctly.

DukaRun opens the system print dialog for every print job. Silent/direct USB printing is not part
of this integration.

### Troubleshooting

- Wrong label position: verify paper size and disable browser scaling or fit-to-page.
- Blank or clipped label: install the manufacturer driver and confirm the media size there matches the chosen layout.
- Barcode will not scan: clean the print head, increase driver print density, and print at 100%.
- Labels skip: calibrate the printer's gap/black-mark sensor using its hardware controls.
