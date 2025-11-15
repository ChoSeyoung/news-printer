export class NewsItemDto {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category: string;
  guid: string;
  fullContent?: string; // Full article content from web scraping
}
