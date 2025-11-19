export class PublishAllDto {
  category?: string;
  limit?: number;
  privacyStatus?: 'public' | 'private' | 'unlisted';
  /** Shorts 1:1 매칭 활성화 (0이 아닌 값 = 롱폼과 1:1로 Shorts 생성) */
  shortsLimit?: number;
  /** 롱폼 업로드 비활성화 (true = Shorts만 업로드) */
  shortsOnly?: boolean;
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
  /** Shorts 처리 결과 */
  shorts?: {
    totalProcessed: number;
    successful: number;
    failed: number;
    results: PublishAllResultItem[];
  };
}
