export class NewsPreviewDto {
  category?: string;
  limit?: number;
}

export interface NewsPreviewItem {
  title: string;
  originalTitle: string;
  description: string;
  tags: string[];
  categoryId: string;
  categoryName: string;
  estimatedDurationSeconds: number;
  anchorScript: string;
  reporterScript: string;
  thumbnailPreview?: string;
}

export class NewsPreviewResponseDto {
  total: number;
  items: NewsPreviewItem[];
  meta: {
    category: string;
    fetchedAt: string;
  };
}
