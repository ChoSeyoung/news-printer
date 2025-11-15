export interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  category?: string;
}

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  item: RssItem | RssItem[];
}

export interface RssFeed {
  rss: {
    channel: RssChannel;
  };
}
