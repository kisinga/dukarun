import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Per-line sale COGS for analytics (FIFO cost).
 * Written when recordSale runs; used by mv_daily_product_sales for margin.
 */
@Entity('sale_cogs')
@Index('IDX_sale_cogs_channel_date_variant', ['channelId', 'saleDate', 'productVariantId'])
@Index('IDX_sale_cogs_order', ['orderId'])
export class SaleCogs {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('int')
  channelId!: number;

  @Column('varchar', { length: 255 })
  orderId!: string;

  @Column('varchar', { length: 255, nullable: true })
  orderLineId!: string | null;

  @Column('int')
  productVariantId!: number;

  @Column('date')
  saleDate!: string;

  @Column('decimal', { precision: 12, scale: 0 })
  quantity!: number;

  @Column('int')
  cogsCents!: number;

  @Column('varchar', { length: 32, default: 'fifo' })
  source!: string;
}
