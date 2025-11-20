import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('published_news')
export class PublishedNews {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  url: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  @Index()
  normalizedTitle: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  videoId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  videoUrl: string;

  @Column({ type: 'varchar', length: 10, default: 'longform' })
  videoType: string; // 'longform' | 'shorts'

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceName: string;

  @CreateDateColumn()
  publishedAt: Date;
}
