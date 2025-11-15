export class PublishNewsDto {
  title: string;
  anchorScript: string;
  reporterScript: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export class PublishNewsResponseDto {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  videoPath?: string;
  error?: string;
}
