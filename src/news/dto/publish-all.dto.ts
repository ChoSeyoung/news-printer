export class PublishAllDto {
  category?: string;
  limit?: number;
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export interface PublishAllResultItem {
  title: string;
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  error?: string;
}

export class PublishAllResponseDto {
  totalProcessed: number;
  successful: number;
  failed: number;
  results: PublishAllResultItem[];
}
