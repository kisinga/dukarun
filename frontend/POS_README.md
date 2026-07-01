# POS System

## Product Entry (3 methods)

1. **📷 AI Camera** - Auto-detects product at 90% confidence
2. **📱 Barcode** - Direct SKU scan (Chrome/Edge)
3. **🔍 Search** - Manual name/SKU lookup

## Services

- `EmbedderService` - Creates image embeddings for label-photo recognition
- `CameraService` - Device camera management
- `BarcodeScannerService` - BarcodeDetector API
- `ProductSearchService` - GraphQL queries

## Recognition Data

```
Product.customFields
├── mlEmbedding          # JSON image embeddings
└── mlEmbeddingVersion   # Embedder compatibility guard
```

## Future: Cashier Role

Two-step flow: Salesperson creates order → Cashier validates payment

**States:** `DRAFT` → `PENDING_PAYMENT` → `PAID`

See [ROADMAP.md](../ROADMAP.md)
