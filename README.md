<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

News Printer - An automated news video generation and publishing system built with NestJS.

This application automatically:
- Fetches news articles from Chosun.com RSS feeds
- Generates AI-powered anchor and reporter scripts using Google Gemini
- Creates news videos with background images, TTS audio, and professional thumbnails
- Uploads videos to YouTube with SEO-optimized metadata
- Prevents duplicate uploads with intelligent tracking

## ✨ Features

- **🤖 AI Script Generation**: Gemini-powered anchor and reporter script generation
- **🎨 Dynamic Background Images**: Automatically searches and downloads relevant images from Pexels/Unsplash
- **🗣️ High-Quality TTS**: Google Cloud Text-to-Speech with Chirp3-HD voices for natural Korean pronunciation
- **📹 Video Creation**: FFmpeg-based video generation with background images and audio
- **📺 YouTube Integration**: Automated upload with SEO-optimized titles, descriptions, and tags
- **🖼️ BBC-Style Thumbnails**: Auto-generated professional news thumbnails
- **🔄 Duplicate Prevention**: Smart tracking system to prevent re-uploading the same news
- **⏰ GitHub Actions Automation**: Fully automated daily news publishing workflow
- **🎯 Preview API**: Preview video metadata before actual publishing

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Features

- **RSS Feed Parsing**: Fetches and parses Chosun.com RSS feeds in real-time
- **Multiple Categories**: Supports various news categories (politics, economy, society, etc.)
- **Clean Data**: Automatically removes HTML tags and entities from news content
- **Error Handling**: Comprehensive error handling with timeout and retry logic
- **TypeScript**: Full TypeScript support with type safety
- **RESTful API**: Simple and intuitive API endpoints

## API Endpoints

### GET /news

Fetches news articles from Chosun.com RSS feed.

**Query Parameters:**
- `limit` (optional): Number of articles to return (1-100, default: 10)
- `category` (optional): News category (default: politics)

**Example Request:**
```bash
# Get 10 politics news articles (default)
curl http://localhost:3000/news

# Get 20 politics news articles
curl http://localhost:3000/news?limit=20

# Get 15 economy news articles
curl http://localhost:3000/news?limit=15&category=economy
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "News Article Title",
      "link": "https://www.chosun.com/...",
      "description": "Article summary text...",
      "pubDate": "2025-11-15T10:30:00Z",
      "category": "politics",
      "guid": "https://www.chosun.com/..."
    }
  ],
  "meta": {
    "total": 10,
    "source": "chosun.com",
    "fetchedAt": "2025-11-15T11:00:00Z",
    "category": "politics"
  }
}
```

## Available Categories

- `politics` - 정치 (default)
- `economy` - 경제
- `society` - 사회
- `international` - 국제
- `culture` - 문화
- `opinion` - 오피니언

## Configuration

Create a `.env` file in the root directory (use `.env.example` as template):

```env
PORT=3000
RSS_BASE_URL=https://www.chosun.com/arc/outboundfeeds/rss/category
RSS_TIMEOUT=10000
RSS_DEFAULT_CATEGORY=politics
RSS_DEFAULT_LIMIT=10
```

## Deployment

For production deployment, build the application and run the compiled JavaScript:

```bash
$ npm run build
$ npm run start:prod
```

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
