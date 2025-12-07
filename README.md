## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your X (Twitter) API key:
   - Get your Bearer Token from [Twitter Developer Portal](https://developer.twitter.com/)
   - Create a `.env.local` file in the root directory
   - Add your API key:
     ```
     VITE_X_API_KEY=your_bearer_token_here
     ```

3. Run the app:
   ```bash
   npm run dev
   ```

## Features

- **Real-time X (Twitter) Search**: Searches X posts for real-time events
- **Engagement Analytics**: Measures likes, retweets, replies, quotes, and views
- **TLDR Summaries**: Automatically generates summaries from top posts
- **Media Links**: Displays images and videos from X posts
- **Direct Post Links**: Click through to view original X posts

## X API Setup

To use this app, you'll need:
1. A Twitter Developer account
2. An API v2 Bearer Token
3. Set the `VITE_X_API_KEY` environment variable with your Bearer Token

The app uses Twitter API v2's `/tweets/search/recent` endpoint to search for real-time events.
# watchdogs
