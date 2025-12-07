import { Incident, FetchIncidentsResponse, XPost, Severity } from "../types";
import { v4 as uuidv4 } from 'uuid';

const X_API_BASE = 'https://api.twitter.com/2';

// Generate random nonce using Web Crypto API
const generateNonce = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Convert ArrayBuffer to base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// HMAC-SHA1 using Web Crypto API
const hmacSha1 = async (message: string, key: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return arrayBufferToBase64(signature);
};

// Helper to get OAuth credentials from environment
const getOAuthCredentials = () => {
  const consumerKey = (import.meta.env.VITE_X_CONSUMER_KEY || '').trim();
  const consumerSecret = (import.meta.env.VITE_X_CONSUMER_SECRET || '').trim();
  const accessToken = (import.meta.env.VITE_X_ACCESS_TOKEN || '').trim();
  const accessTokenSecret = (import.meta.env.VITE_X_ACCESS_TOKEN_SECRET || '').trim();
  
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error("X API OAuth credentials are missing. Please set VITE_X_CONSUMER_KEY, VITE_X_CONSUMER_SECRET, VITE_X_ACCESS_TOKEN, and VITE_X_ACCESS_TOKEN_SECRET environment variables.");
  }
  
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
};

// Generate OAuth 1.0a signature
const generateOAuthSignature = async (
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> => {
  // Create parameter string
  const paramString = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  // Create signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString)
  ].join('&');
  
  // Create signing key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  
  // Generate signature using Web Crypto API
  const signature = await hmacSha1(signatureBaseString, signingKey);
  
  return signature;
};

// Generate OAuth 1.0a authorization header
const generateOAuthHeader = async (
  method: string,
  baseUrl: string,
  queryParams: Record<string, string>,
  credentials: ReturnType<typeof getOAuthCredentials>
): Promise<string> => {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = credentials;
  
  // OAuth parameters
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_token: accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0',
  };
  
  // Combine OAuth params with query params for signature
  const allParams = { ...oauthParams, ...queryParams };
  
  // Generate signature (baseUrl should not include query string)
  const signature = await generateOAuthSignature(method, baseUrl, allParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  
  // Build authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ');
  
  return authHeader;
};

// Search tweets using X API v2 via proxy
const searchTweets = async (query: string, maxResults: number = 100): Promise<any[]> => {
  // X API requires max_results between 10 and 100
  const validMaxResults = Math.max(10, Math.min(100, maxResults));
  
  // Use local proxy to avoid CORS issues
  const queryString = new URLSearchParams({
    query: query,
    max_results: validMaxResults.toString(),
  }).toString();
  
  const url = `/api/x/search?${queryString}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `X API Error: ${response.status}`;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.errors && errorData.errors.length > 0) {
          errorMessage = errorData.errors.map((e: any) => e.message || e.detail).join(', ');
        }
      } catch (e) {
        // If error text is not JSON, use the text as is
        if (errorText) {
          errorMessage = errorText.substring(0, 200);
        }
      }
      
      if (response.status === 401) {
        errorMessage = `X API Authentication failed (401). ${errorMessage}. Please check your API credentials in .env.local.`;
      } else if (response.status === 429) {
        errorMessage = `X API Rate limit exceeded (429). ${errorMessage}. Please wait a few minutes and try again.`;
      } else if (response.status === 403) {
        errorMessage = `X API Access forbidden (403). ${errorMessage}. Please check your API permissions.`;
      } else if (response.status === 500 || response.status >= 502) {
        errorMessage = `X API Server error (${response.status}). ${errorMessage}. The X API may be experiencing issues.`;
      }
      
      console.error(`X API Search Error [${response.status}]:`, errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Handle API errors in response
    if (data.errors && data.errors.length > 0) {
      throw new Error(`X API Error: ${data.errors.map((e: any) => e.message).join(', ')}`);
    }
    
    // Map tweets with author and media information
    const tweets = data.data || [];
    if (!Array.isArray(tweets)) {
      console.warn('X API returned non-array data:', data);
      return [];
    }
    
    // Debug: Log first tweet to verify we're getting real data
    if (tweets.length > 0) {
      console.log('Sample tweet from X API:', {
        id: tweets[0].id,
        text: tweets[0].text?.substring(0, 50),
        likes: tweets[0].public_metrics?.like_count,
        hasMedia: !!tweets[0].attachments?.media_keys?.length,
        authorId: tweets[0].author_id
      });
    }
    
    const users = (data.includes?.users || []).reduce((acc: any, user: any) => {
      if (user && user.id) {
        acc[user.id] = user;
      }
      return acc;
    }, {});
    
    const media = (data.includes?.media || []).reduce((acc: any, m: any) => {
      if (m && m.media_key) {
        acc[m.media_key] = m;
        // Debug: Log media to verify URLs
        if (m.url || m.preview_image_url) {
          console.log('Media found:', { type: m.type, url: m.url, previewUrl: m.preview_image_url });
        }
      }
      return acc;
    }, {});

    // Filter unrelated posts - keep only posts relevant to incidents
    // More lenient filtering to catch real incidents
    const relevantKeywords = [
      'shooting', 'shots fired', 'active shooter', 'emergency', 'police', 'SWAT',
      'evacuate', 'incident', 'alert', 'crime', 'arrest', 'suspect', 'victim',
      'hospital', 'ambulance', 'fire', 'explosion', 'threat', 'danger', 'lockdown',
      'breaking', 'officer', 'respond', 'scene', 'investigation', 'homicide',
      'stabbing', 'assault', 'robbery', 'weapon', 'gun', 'violence'
    ];
    
    const filteredTweets = tweets.filter((tweet: any) => {
      if (!tweet || !tweet.id || !tweet.text) return false;
      
      const text = tweet.text.toLowerCase();
      // Check if tweet contains relevant keywords or is from verified/authoritative accounts
      const hasRelevantKeyword = relevantKeywords.some(keyword => text.includes(keyword));
      const isVerified = users[tweet.author_id]?.verified;
      
      // Keep if it has relevant keywords OR is from verified account OR has high engagement
      const hasEngagement = (tweet.public_metrics?.like_count || 0) > 10 || 
                           (tweet.public_metrics?.retweet_count || 0) > 5;
      
      return hasRelevantKeyword || isVerified || hasEngagement;
    });
    
    return filteredTweets
      .map((tweet: any) => {
        const author = users[tweet.author_id];
        // Extract media - handle both media_keys in attachments and entities.media
        const mediaKeys = tweet.attachments?.media_keys || [];
        const entityMedia = tweet.entities?.media?.map((m: any) => m.media_key).filter(Boolean) || [];
        const allMediaKeys = [...new Set([...mediaKeys, ...entityMedia])];
        
        const tweetMedia = allMediaKeys
          .map((key: string) => media[key])
          .filter((m: any) => m && (m.url || m.preview_image_url));
        
        return {
          id: tweet.id,
          text: tweet.text || '',
          author: author ? {
            username: author.username || 'unknown',
            name: author.name || 'Unknown User',
            verified: author.verified || false,
            profileImageUrl: author.profile_image_url || undefined,
          } : {
            username: 'unknown',
            name: 'Unknown User',
            verified: false,
          },
          url: `https://twitter.com/${author?.username || 'unknown'}/status/${tweet.id}`,
          timestamp: tweet.created_at || new Date().toISOString(),
          engagement: {
            likes: tweet.public_metrics?.like_count || 0,
            retweets: tweet.public_metrics?.retweet_count || 0,
            replies: tweet.public_metrics?.reply_count || 0,
            quotes: tweet.public_metrics?.quote_count || 0,
            views: tweet.public_metrics?.impression_count || 0,
          },
          media: tweetMedia.map((m: any) => ({
            type: (m.type === 'photo' ? 'photo' : m.type === 'video' ? 'video' : m.type === 'animated_gif' ? 'gif' : 'photo') as 'photo' | 'video' | 'gif',
            url: m.url || m.preview_image_url || '',
            previewUrl: m.preview_image_url || m.url || '',
          })),
        };
      });
  } catch (error) {
    console.error("X API Search Error:", error);
    throw error;
  }
};

// Analyze sentiment of posts
const analyzeSentiment = (posts: XPost[]): { sentiment: 'positive' | 'neutral' | 'negative'; confidence: number; verifiedCount: number } => {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let verifiedCount = 0;
  
  posts.forEach(post => {
    if (post.author.verified) verifiedCount++;
    
    const text = post.text.toLowerCase();
    const negativeWords = ['false', 'hoax', 'fake', 'debunked', 'unconfirmed', 'rumor'];
    const positiveWords = ['confirmed', 'verified', 'official', 'police', 'authorities'];
    
    const hasNegative = negativeWords.some(word => text.includes(word));
    const hasPositive = positiveWords.some(word => text.includes(word));
    
    if (hasNegative) negative++;
    else if (hasPositive) positive++;
    else neutral++;
  });
  
  const total = posts.length;
  const sentiment = negative > positive ? 'negative' : positive > neutral ? 'positive' : 'neutral';
  const confidence = Math.max(positive, negative, neutral) / total;
  
  return { sentiment, confidence, verifiedCount };
};

// Generate TLDR summary as a narrative with clickable citations (shorter, location-aware)
const generateTLDR = (posts: XPost[], incidentLocation: string): { summary: string; citations: Array<{ id: number; url: string; username: string }> } => {
  if (posts.length === 0) return { summary: "No information available.", citations: [] };
  
  // Sort by engagement and relevance (shootings get priority)
  const sortedPosts = [...posts].sort((a, b) => {
    const aText = a.text.toLowerCase();
    const bText = b.text.toLowerCase();
    const aIsShooting = aText.includes('shooting') || aText.includes('shots fired');
    const bIsShooting = bText.includes('shooting') || bText.includes('shots fired');
    
    if (aIsShooting && !bIsShooting) return -1;
    if (!aIsShooting && bIsShooting) return 1;
    
    const engagementA = a.engagement.likes + a.engagement.retweets;
    const engagementB = b.engagement.likes + b.engagement.retweets;
    return engagementB - engagementA;
  });

  // Take top 5-7 most relevant posts
  const topPosts = sortedPosts.slice(0, 7);
  
  // Extract key information for narrative
  const incidentType = topPosts.some(p => p.text.toLowerCase().includes('shooting')) ? 'shooting' : 'incident';
  const isShooting = incidentType === 'shooting';
  
  // Extract what happened
  const whatHappened: string[] = [];
  const suspectInfo: string[] = [];
  const resolution: string[] = [];
  const casualties: string[] = [];
  const times: string[] = [];
  
  topPosts.forEach(post => {
    const text = post.text.toLowerCase();
    const cleanText = post.text.replace(/https?:\/\/[^\s]+/g, '').trim();
    
    // Extract what happened
    if (text.match(/(?:shooting|shots fired|gunfire|active shooter)/i)) {
      const match = cleanText.match(/(.{0,200}(?:shooting|shots fired|gunfire|active shooter).{0,200})/i);
      if (match && !whatHappened.includes(match[0])) whatHappened.push(match[0]);
    }
    
    // Extract suspect information
    if (text.match(/(?:suspect|arrested|in custody|perpetrator|shooter)/i)) {
      const match = cleanText.match(/(.{0,200}(?:suspect|arrested|in custody|perpetrator|shooter).{0,200})/i);
      if (match && !suspectInfo.includes(match[0])) suspectInfo.push(match[0]);
    }
    
    // Extract resolution/status
    if (text.match(/(?:resolved|cleared|evacuated|contained|under control|arrested|in custody)/i)) {
      const match = cleanText.match(/(.{0,200}(?:resolved|cleared|evacuated|contained|under control|arrested|in custody).{0,200})/i);
      if (match && !resolution.includes(match[0])) resolution.push(match[0]);
    }
    
    // Extract casualties
    if (text.match(/(?:injured|killed|wounded|victim|casualty|hospitalized)/i)) {
      const match = cleanText.match(/(.{0,200}(?:injured|killed|wounded|victim|casualty|hospitalized).{0,200})/i);
      if (match && !casualties.includes(match[0])) casualties.push(match[0]);
    }
    
    // Extract time references
    const timeMatch = post.text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?|just now|minutes? ago|hours? ago|today|yesterday)/i);
    if (timeMatch) times.push(timeMatch[0]);
  });

  // Build shorter narrative summary - use the actual incident location
  let summary = '';
  const citations: Array<{ id: number; url: string; username: string }> = [];
  const usedUrls = new Set<string>();
  
  // Filter posts that mention the incident location
  const locationPosts = topPosts.filter(p => {
    const text = p.text.toLowerCase();
    const locLower = incidentLocation.toLowerCase();
    return text.includes(locLower) || 
           (locLower.includes('stanford') && text.includes('stanford')) ||
           (locLower.includes('westfield') && (text.includes('westfield') || text.includes('valley fair'))) ||
           (locLower.includes('palo alto') && text.includes('palo alto')) ||
           (locLower.includes('san jose') && text.includes('san jose'));
  });
  
  const relevantPosts = locationPosts.length > 0 ? locationPosts : topPosts;
  
  // What happened - shorter version, using actual location
  if (whatHappened.length > 0 && isShooting) {
    const primaryPost = relevantPosts.find(p => {
      const text = p.text.toLowerCase();
      return (text.includes('shooting') || text.includes('shots fired')) &&
             (p.text.toLowerCase().includes(incidentLocation.toLowerCase()) || 
              incidentLocation.toLowerCase().includes('stanford') && text.includes('stanford') ||
              incidentLocation.toLowerCase().includes('westfield') && (text.includes('westfield') || text.includes('valley fair')));
    }) || relevantPosts[0];
    
    if (!usedUrls.has(primaryPost.url)) {
      citations.push({ id: 1, url: primaryPost.url, username: primaryPost.author.username });
      usedUrls.add(primaryPost.url);
    }
    
    summary += `Shooting reported at ${incidentLocation}. [@${primaryPost.author.username}](${primaryPost.url}) `;
    
    if (casualties.length > 0) {
      const casualtyText = casualties[0].toLowerCase();
      if (casualtyText.includes('killed') || casualtyText.includes('dead')) {
        summary += `reported fatalities`;
      } else if (casualtyText.includes('injured')) {
        summary += `reported injuries`;
      }
    } else {
      summary += `reported the incident`;
    }
    summary += `. `;
  }
  
  // Suspect/Resolution - very brief
  if (suspectInfo.length > 0) {
    const suspectPost = relevantPosts.find(p => 
      p.text.toLowerCase().match(/(?:suspect|arrested|in custody)/i)
    ) || relevantPosts[1];
    
    if (suspectPost && !usedUrls.has(suspectPost.url)) {
      citations.push({ id: citations.length + 1, url: suspectPost.url, username: suspectPost.author.username });
      usedUrls.add(suspectPost.url);
    }
    
    if (suspectInfo[0].toLowerCase().includes('arrested') || suspectInfo[0].toLowerCase().includes('in custody')) {
      summary += `[@${suspectPost?.author.username || 'source'}](${suspectPost?.url || '#'}) confirmed suspect in custody. `;
    }
  }
  
  if (resolution.length > 0 && resolution[0].toLowerCase().includes('cleared')) {
    summary += `Scene cleared.`;
  }

  return { summary: summary.trim(), citations };
};

// Calculate total engagement metrics
const calculateTotalEngagement = (posts: XPost[]) => {
  return posts.reduce((acc, post) => ({
    totalLikes: acc.totalLikes + post.engagement.likes,
    totalRetweets: acc.totalRetweets + post.engagement.retweets,
    totalReplies: acc.totalReplies + post.engagement.replies,
    totalQuotes: acc.totalQuotes + post.engagement.quotes,
    totalViews: (acc.totalViews || 0) + (post.engagement.views || 0),
  }), {
    totalLikes: 0,
    totalRetweets: 0,
    totalReplies: 0,
    totalQuotes: 0,
    totalViews: 0,
  });
};

// Determine severity based on engagement and keywords - shootings are high priority
const determineSeverity = (posts: XPost[]): Severity => {
  if (posts.length === 0) return 'low';
  
  const totalEngagement = calculateTotalEngagement(posts);
  const totalReactions = totalEngagement.totalLikes + totalEngagement.totalRetweets;
  
  // Check for shooting keywords - these get high priority
  const shootingKeywords = ['shooting', 'shots fired', 'active shooter', 'gunfire'];
  const hasShooting = posts.some(post => 
    shootingKeywords.some(keyword => post.text.toLowerCase().includes(keyword))
  );
  
  // Check for other critical keywords
  const criticalKeywords = ['emergency', 'evacuate', 'police', 'SWAT', 'lockdown'];
  const hasCriticalKeyword = posts.some(post => 
    criticalKeywords.some(keyword => post.text.toLowerCase().includes(keyword))
  );
  
  // Shootings are always at least high priority
  if (hasShooting) {
    if (totalReactions > 500) return 'critical';
    return 'high';
  }
  
  if (hasCriticalKeyword && totalReactions > 1000) return 'critical';
  if (hasCriticalKeyword && totalReactions > 500) return 'high';
  if (totalReactions > 1000) return 'high';
  if (totalReactions > 500) return 'medium';
  return 'low';
};

// Extract location from posts - use the anchored location from grouping
const extractLocation = (posts: XPost[]): string => {
  // Use the most confident location from the posts
  const locationScores = new Map<string, number>();
  
  posts.forEach(post => {
    const postLocation = extractPostLocation(post);
    if (postLocation.location && postLocation.confidence > 0.5) {
      const currentScore = locationScores.get(postLocation.location) || 0;
      locationScores.set(postLocation.location, currentScore + postLocation.confidence);
    }
  });
  
  if (locationScores.size === 0) {
    // Fallback to simple extraction
    const foundLocations: string[] = [];
    posts.forEach(post => {
      const text = post.text.toLowerCase();
      const cities = ['stanford', 'palo alto', 'san jose', 'menlo park', 'mountain view', 
                      'redwood city', 'east palo alto', 'santa clara', 'cupertino', 'sunnyvale',
                      'fremont', 'milpitas', 'westfield valley fair', 'valley fair'];
      
      cities.forEach(city => {
        if (text.includes(city) && !foundLocations.includes(city)) {
          foundLocations.push(city);
        }
      });
    });
    
    if (foundLocations.length > 0) {
      return foundLocations[0].charAt(0).toUpperCase() + foundLocations[0].slice(1);
    }
    
    return "Bay Area, CA";
  }
  
  // Return location with highest score
  let bestLocation = '';
  let bestScore = 0;
  locationScores.forEach((score, location) => {
    if (score > bestScore) {
      bestScore = score;
      bestLocation = location;
    }
  });
  
  return bestLocation;
};

// Extract coordinates (rough estimate based on location)
const getCoordinates = (location: string): { lat: number; lng: number } => {
  const locationMap: Record<string, { lat: number; lng: number }> = {
    'stanford': { lat: 37.4275, lng: -122.1697 },
    'palo alto': { lat: 37.4419, lng: -122.1430 },
    'valley fair': { lat: 37.3230, lng: -121.9465 },
    'westfield': { lat: 37.3230, lng: -121.9465 },
    'westfield valley fair': { lat: 37.3230, lng: -121.9465 },
    'san jose': { lat: 37.3382, lng: -121.8863 },
    'menlo park': { lat: 37.4538, lng: -122.1821 },
    'mountain view': { lat: 37.3861, lng: -122.0839 },
    'redwood city': { lat: 37.4852, lng: -122.2364 },
    'east palo alto': { lat: 37.4688, lng: -122.1411 },
    'santa clara': { lat: 37.3541, lng: -121.9552 },
    'cupertino': { lat: 37.3230, lng: -122.0322 },
    'sunnyvale': { lat: 37.3688, lng: -122.0363 },
    'fremont': { lat: 37.5483, lng: -121.9886 },
    'milpitas': { lat: 37.4283, lng: -121.9066 },
    'oakland': { lat: 37.8044, lng: -122.2711 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
    'stockton': { lat: 37.9577, lng: -121.2908 },
    'outer richmond': { lat: 37.7715, lng: -122.5045 },
    'skyline high school': { lat: 37.7894, lng: -122.1614 },
    'laney college': { lat: 37.7974, lng: -122.2653 },
  };
  
  const locLower = location.toLowerCase();
  for (const [key, coords] of Object.entries(locationMap)) {
    if (locLower.includes(key)) {
      return coords;
    }
  }
  
  return { lat: 37.4275, lng: -122.1697 }; // Default to Stanford
};

// Extract topics/themes from a post
const extractTopics = (post: XPost): string[] => {
  const text = post.text.toLowerCase();
  const topics: string[] = [];
  
  // Incident types
  if (text.includes('shooting') || text.includes('shots fired')) topics.push('shooting');
  if (text.includes('active shooter')) topics.push('active_shooter');
  if (text.includes('arrest')) topics.push('arrest');
  if (text.includes('suspect')) topics.push('suspect');
  if (text.includes('victim') || text.includes('injured') || text.includes('killed')) topics.push('casualties');
  if (text.includes('evacuat')) topics.push('evacuation');
  if (text.includes('lockdown')) topics.push('lockdown');
  
  return topics;
};

// Extract primary location from a single post with high confidence
const extractPostLocation = (post: XPost): { location: string; confidence: number } => {
  const text = post.text;
  const textLower = text.toLowerCase();

  // Enhanced specific places with more keywords and specific locations
  const specificPlaces: Array<{ name: string; keywords: string[]; priority: number }> = [
    // Specific buildings/landmarks (highest priority)
    { name: 'Westfield Valley Fair', keywords: ['westfield valley fair', 'valley fair mall', 'valley fair shopping center'], priority: 1 },
    { name: 'Stanford Shopping Center', keywords: ['stanford shopping center', 'stanford mall'], priority: 1 },
    { name: 'Stanford University', keywords: ['stanford university', 'stanford campus'], priority: 1 },
    { name: 'Hoover Tower', keywords: ['hoover tower'], priority: 1 },
    { name: 'Main Quad', keywords: ['main quad'], priority: 1 },
    { name: 'Green Library', keywords: ['green library'], priority: 1 },
    { name: 'Santana Row', keywords: ['santana row'], priority: 1 },
    { name: 'SAP Center', keywords: ['sap center', 'sap arena', 'shark tank'], priority: 1 },
    { name: 'Levi\'s Stadium', keywords: ['levi\'s stadium', 'levis stadium'], priority: 1 },
    { name: 'Stanford Hospital', keywords: ['stanford hospital', 'stanford medical center'], priority: 1 },
    { name: 'Valley Medical Center', keywords: ['valley medical center', 'vmc'], priority: 1 },

    // Cities (lower priority)
    { name: 'Stanford', keywords: ['stanford'], priority: 3 },
    { name: 'Palo Alto', keywords: ['palo alto'], priority: 3 },
    { name: 'San Jose', keywords: ['san jose'], priority: 3 },
    { name: 'Menlo Park', keywords: ['menlo park'], priority: 3 },
    { name: 'Mountain View', keywords: ['mountain view'], priority: 3 },
    { name: 'Redwood City', keywords: ['redwood city'], priority: 3 },
    { name: 'East Palo Alto', keywords: ['east palo alto'], priority: 3 },
    { name: 'Santa Clara', keywords: ['santa clara'], priority: 3 },
    { name: 'Cupertino', keywords: ['cupertino'], priority: 3 },
    { name: 'Sunnyvale', keywords: ['sunnyvale'], priority: 3 },
    { name: 'Fremont', keywords: ['fremont'], priority: 3 },
    { name: 'Milpitas', keywords: ['milpitas'], priority: 3 },
  ];

  // Sort by priority (specific places first)
  specificPlaces.sort((a, b) => a.priority - b.priority);

  // Check for specific places first (highest confidence)
  for (const place of specificPlaces) {
    for (const keyword of place.keywords) {
      if (textLower.includes(keyword)) {
        // Higher confidence for specific buildings vs cities
        const confidence = place.priority === 1 ? 0.95 : 0.75;
        return { location: place.name, confidence };
      }
    }
  }

  // Enhanced address patterns - capture full street addresses
  const addressPatterns = [
    // "at/on/near 123 Main Street" or "123 Main St"
    /(?:at|on|near|in)\s+(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln|Circle|Cir|Court|Ct|Place|Pl)\.?)/i,
    // Just the address without preposition
    /(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln|Circle|Cir|Court|Ct|Place|Pl)\.?)/i,
    // Address with city context "123 Main St, Palo Alto" or "123 Main St in Palo Alto"
    /(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln|Circle|Cir|Court|Ct|Place|Pl)\.?(?:,?\s+(?:in|at|near)\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  for (const pattern of addressPatterns) {
    const addressMatch = text.match(pattern);
    if (addressMatch && addressMatch[1]) {
      const address = addressMatch[1].trim();
      // Filter out false positives (e.g., "Emergency Alert Street")
      if (!textLower.includes('alert') || address.toLowerCase().includes('st') || address.toLowerCase().includes('street')) {
        return { location: address, confidence: 0.9 };
      }
    }
  }

  // Enhanced building/venue names pattern
  const buildingPatterns = [
    // "at/in Building Name Mall/Center/etc"
    /(?:at|in|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s+(?:Mall|Center|Centre|Store|Shop|Restaurant|Cafe|Cafeteria|Hospital|Clinic|School|University|Campus|Park|Plaza|Square|Stadium|Arena|Building|Tower|Hall|Library|Museum|Theater|Theatre|Hotel|Inn|Market|Station|Terminal|Airport))/i,
    // "at/in The Building Name"
    /(?:at|in|near)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s+(?:Building|Tower|Hall|Center|Library|Museum))/i,
  ];

  for (const pattern of buildingPatterns) {
    const buildingMatch = text.match(pattern);
    if (buildingMatch && buildingMatch[1]) {
      const building = buildingMatch[1].trim();
      // Filter out action words
      const actionWords = ['shooting', 'arrested', 'incident', 'alert', 'emergency', 'police', 'active', 'reported'];
      if (!actionWords.some(word => building.toLowerCase().includes(word))) {
        return { location: building, confidence: 0.85 };
      }
    }
  }

  // Check for intersection patterns "at Main St & First Ave" or "Main and First"
  const intersectionPattern = /(?:at|near)\s+([A-Z][a-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln))?)\s+(?:and|&)\s+([A-Z][a-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln))?)/i;
  const intersectionMatch = text.match(intersectionPattern);
  if (intersectionMatch && intersectionMatch[1] && intersectionMatch[2]) {
    return { location: `${intersectionMatch[1].trim()} & ${intersectionMatch[2].trim()}`, confidence: 0.85 };
  }

  // Check for neighborhood/area names
  const neighborhoodPattern = /(?:in|at|near)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:neighborhood|area|district|region|vicinity))/i;
  const neighborhoodMatch = text.match(neighborhoodPattern);
  if (neighborhoodMatch && neighborhoodMatch[1]) {
    return { location: neighborhoodMatch[1].trim(), confidence: 0.7 };
  }

  return { location: '', confidence: 0 };
};

// Advanced incident anchoring algorithm - groups posts by location, topic, and time
const anchorIncidentsToLocations = (posts: XPost[]): Array<{ posts: XPost[]; location: string; topics: string[]; timestamp: string }> => {
  const incidents: Array<{ posts: XPost[]; location: string; topics: string[]; timestamp: string }> = [];
  const processed = new Set<string>();
  
  // First pass: Group posts with clear locations
  posts.forEach(post => {
    if (processed.has(post.id)) return;
    
    const postLocation = extractPostLocation(post);
    if (postLocation.confidence < 0.5) return; // Skip posts without clear location
    
    const postTopics = extractTopics(post);
    const postTime = new Date(post.timestamp).getTime();
    
    // Find or create incident cluster
    let matchedIncident = incidents.find(incident => {
      // Same location (exact match or one contains the other)
      const loc1 = incident.location.toLowerCase();
      const loc2 = postLocation.location.toLowerCase();
      if (loc1 !== loc2 && !loc1.includes(loc2) && !loc2.includes(loc1)) return false;
      
      // Similar topics (at least one topic overlap for shootings)
      const topicOverlap = incident.topics.some(topic => postTopics.includes(topic));
      const isShooting = postTopics.includes('shooting') || incident.topics.includes('shooting');
      if (!topicOverlap && incident.topics.length > 0 && postTopics.length > 0 && isShooting) return false;
      
      // Within 24 hour window
      const incidentTime = new Date(incident.timestamp).getTime();
      const timeDiff = Math.abs(postTime - incidentTime);
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      if (hoursDiff > 24) return false;
      
      return true;
    });
    
    if (matchedIncident) {
      matchedIncident.posts.push(post);
      // Update topics union
      postTopics.forEach(topic => {
        if (!matchedIncident!.topics.includes(topic)) {
          matchedIncident!.topics.push(topic);
        }
      });
      // Update to most recent timestamp
      if (postTime > new Date(matchedIncident.timestamp).getTime()) {
        matchedIncident.timestamp = post.timestamp;
      }
      // Use more specific location if available
      if (postLocation.confidence > 0.8 && matchedIncident.location.length < postLocation.location.length) {
        matchedIncident.location = postLocation.location;
      }
    } else {
      // Create new incident
      incidents.push({
        posts: [post],
        location: postLocation.location,
        topics: [...postTopics],
        timestamp: post.timestamp,
      });
    }
    
    processed.add(post.id);
  });
  
  // Second pass: Try to match posts without clear locations to existing incidents
  posts.forEach(post => {
    if (processed.has(post.id)) return;
    
    const postLocation = extractPostLocation(post);
    const postTopics = extractTopics(post);
    const postTime = new Date(post.timestamp).getTime();
    const postText = post.text.toLowerCase();
    
    // Find incident that matches by topic and time, and text mentions location
    let matchedIncident = incidents.find(incident => {
      // Check if post text mentions the incident location
      const mentionsLocation = postText.includes(incident.location.toLowerCase());
      if (!mentionsLocation) return false;
      
      // Similar topics
      const topicOverlap = incident.topics.some(topic => postTopics.includes(topic));
      if (!topicOverlap && incident.topics.length > 0 && postTopics.length > 0) return false;
      
      // Within 24 hour window
      const incidentTime = new Date(incident.timestamp).getTime();
      const timeDiff = Math.abs(postTime - incidentTime);
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      if (hoursDiff > 24) return false;
      
      return true;
    });
    
    if (matchedIncident) {
      matchedIncident.posts.push(post);
      postTopics.forEach(topic => {
        if (!matchedIncident!.topics.includes(topic)) {
          matchedIncident!.topics.push(topic);
        }
      });
      processed.add(post.id);
    }
  });
  
  // Filter incidents with minimum posts - reduced to 1 to show more results
  return incidents.filter(incident => incident.posts.length >= 1);
};

// Group posts by location and time to create multiple incidents (improved)
const groupPostsByIncident = (posts: XPost[]): Array<{ posts: XPost[]; location: string }> => {
  // Use advanced anchoring algorithm
  const anchoredIncidents = anchorIncidentsToLocations(posts);
  
  // Return posts with their anchored locations
  return anchoredIncidents.map(incident => ({
    posts: incident.posts,
    location: incident.location
  }));
};

// Search incidents by city - broader real-time search
const searchByCity = async (city: string, hoursBack: number = 24): Promise<XPost[]> => {
  // Use broader search terms to catch real incidents
  const queries = [
    `(shooting OR "shots fired" OR "active shooter" OR gunfire) ${city} -is:retweet lang:en`,
    `(police OR emergency OR incident OR crime) ${city} -is:retweet lang:en`,
    `(breaking OR alert OR "police activity") ${city} -is:retweet lang:en`,
  ];

  const allTweets: XPost[] = [];
  
  for (const query of queries) {
    try {
      const tweets = await searchTweets(query, 100);
      tweets.forEach(tweet => {
        // Avoid duplicates
        if (!allTweets.find(t => t.id === tweet.id)) {
          allTweets.push({
            id: tweet.id,
            text: tweet.text,
            author: tweet.author,
            url: tweet.url,
            timestamp: tweet.timestamp,
            engagement: tweet.engagement,
            media: tweet.media || [],
          });
        }
      });
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error searching ${city} with query "${query}":`, error);
    }
  }
  
  return allTweets;
};

// Search police department accounts for incident reports - broader terms
const searchPoliceReports = async (): Promise<XPost[]> => {
  const policeAccounts = [
    'from:SJPD',
    'from:PaloAltoPolice',
    'from:StanfordDPS',
    'from:MenloParkPD',
    'from:MountainViewPD',
    'from:RedwoodCityPD',
    'from:SantaClaraPD',
    'from:CupertinoPD',
    'from:SunnyvalePD',
    'from:FremontPD',
    'from:MilpitasPD',
    'from:SFPD',
    'from:OaklandPD',
    'from:SFPDAlerts'
  ];
  
  // Broader search terms to catch more incidents
  const queries = policeAccounts.flatMap(account => [
    `${account} (shooting OR "shots fired" OR "active shooter" OR homicide) -is:retweet lang:en`,
    `${account} (incident OR emergency OR alert OR crime) -is:retweet lang:en`
  ]);
  
  try {
    const allResults = await Promise.all(
      queries.map(query => searchTweets(query, 100).catch(() => []))
    );
    
    return allResults.flat().map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      author: tweet.author,
      url: tweet.url,
      timestamp: tweet.timestamp,
      engagement: tweet.engagement,
      media: tweet.media || [],
    }));
  } catch (error) {
    console.error('Error searching police reports:', error);
    return [];
  }
};

// Helper function to filter posts with very low engagement (at least one metric should be > 0)
// This is much more lenient to allow real posts through
const filterLowEngagementPosts = (posts: XPost[]): XPost[] => {
  return posts.filter(post => {
    const engagement = post.engagement;
    // Keep posts that have at least some engagement (likes OR retweets OR replies > 0)
    // This ensures we get real posts while filtering out completely inactive ones
    return (engagement.likes > 0 || engagement.retweets > 0 || engagement.replies > 0 || engagement.views > 0);
  });
};

// Fetch hardcoded incidents with real X posts - MAXIMUM posts and engagement
const fetchHardcodedIncidents = async (): Promise<Incident[]> => {
  const hardcodedIncidents = [
    {
      title: "17-year-old shoots 3 people at Westfield Valley Fair Mall",
      location: "Westfield Valley Fair Mall, San Jose",
      coordinates: { lat: 37.3230, lng: -121.9465 }, // Valley Fair
      timestamp: "2025-12-02T20:00:00Z", // Dec 2, 2025
      description: "A 17-year-old opened fire at the mall (Black Friday aftermath), injuring three people (a man, a woman, and a 16-year-old girl). All were treated for non-life-threatening wounds. ABC7 Los Angeles. NBC Bay Area.",
      searchQueries: [
        // Direct mall name variations
        '"Westfield Valley Fair" shooting',
        '"Valley Fair" shooting',
        'Valley Fair Mall shooting',
        'Westfield Valley Fair shooting',
        'Valley Fair shooting San Jose',
        // San Jose + mall shooting
        'San Jose mall shooting',
        'Santa Clara mall shooting',
        'South Bay mall shooting',
        // Black Friday related
        'Black Friday shooting Valley Fair',
        'Black Friday shooting San Jose mall',
        'Valley Fair Black Friday shooting',
        // 17-year-old shooter
        '17-year-old Valley Fair',
        'teenager Valley Fair shooting',
        'juvenile Valley Fair shooting',
        // Injured people
        'Valley Fair shooting 3 injured',
        'Valley Fair shooting 3 people',
        'Valley Fair shooting man woman girl',
        // News sources
        'from:ABC7 Valley Fair',
        'from:NBCBayArea Valley Fair',
        'ABC7 Los Angeles Valley Fair',
        'NBC Bay Area Valley Fair',
        // Additional variations
        'Westfield Valley Fair incident',
        'Valley Fair shooting news',
        'San Jose Valley Fair shooting',
        'Santa Clara Valley Fair shooting',
        'South Bay shooting'
      ]
    },
    {
      title: "Juvenile shoots 1 student at Phillip and Sala Burton Academic High School",
      location: "Phillip and Sala Burton Academic High School, San Francisco",
      coordinates: { lat: 37.7749, lng: -122.4194 }, // San Francisco
      timestamp: "2025-12-02T20:00:00Z", // Dec 2, 2025 around lunchtime PT
      description: "Student shot (leg wound) on campus around lunchtime; juvenile suspect taken into custody. School was locked down briefly. San Francisco Police Department. KALW.",
      searchQueries: [
        // Direct school name variations
        '"Burton High School" shooting',
        '"Phillip and Sala Burton" shooting',
        '"Phillip and Sala Burton Academic High School" shooting',
        'Burton Academic High School shooting',
        'Burton High School San Francisco shooting',
        // San Francisco + school shooting
        'San Francisco school shooting ',
        'San Francisco school shooting ',
        'SF school shooting ',
        'SFUSD shooting ',
        'SFUSD Burton shooting',
        // Police department
        'from:SFPD Burton High School',
        'from:SFPD school shooting',
        'SFPD Burton High School',
        'San Francisco Police Department Burton',
        // Student + shooting
        'student shot Burton High School',
        'student shot San Francisco school',
        'juvenile suspect Burton High School',
        'school lockdown San Francisco December',
        // News sources
        'from:KALW Burton',
        'KALW Burton High School',
        'KALW school shooting',
        // Location-based
        'shooting at Burton High School San Francisco',
        'shooting Burton High School campus',
        'Burton High School lockdown',
        'Burton High School incident December',
        // Additional variations
        'Burton High School leg wound',
        'student leg wound Burton',
        'juvenile arrested Burton High School',
        'Burton High School suspect custody'
      ]
    },
    {
      title: "Unidentified person shoots 1 man at Turk Street, Tenderloin",
      location: "Turk Street, Tenderloin, San Francisco",
      coordinates: { lat: 37.7831, lng: -122.4168 }, // Tenderloin area
      timestamp: "2025-12-02T14:12:00Z", // 6:12 AM PT = 14:12 UTC
      description: "Man found fatally shot while sitting inside his car on Turk Street at ~6:12 a.m. Police investigating as homicide. NBC Bay Area. San Francisco Police Department.",
      searchQueries: [
        // Direct location variations
        'Tenderloin shooting Turk Street ',
        'Tenderloin shooting Turk Street ',
        'Turk Street shooting Tenderloin ',
        'Turk Street homicide Tenderloin',
        'Tenderloin fatal shooting Turk Street',
        'Tenderloin shooting car ',
        // San Francisco + homicide/shooting
        'San Francisco homicide Turk Street',
        'San Francisco homicide ',
        'San Francisco homicide ',
        'SF homicide Turk Street',
        'San Francisco fatal shooting Tenderloin',
        'SF fatal shooting Tenderloin',
        // Police department
        'from:SFPD Tenderloin shooting',
        'from:SFPD Turk Street',
        'from:SFPD homicide December',
        'SFPD Tenderloin shooting ',
        'SFPD Turk Street homicide',
        'San Francisco Police Department Tenderloin',
        // News sources
        'from:NBCBayArea Tenderloin',
        'from:NBCBayArea Turk Street',
        'NBC Bay Area Tenderloin shooting',
        'NBC Bay Area Turk Street',
        // Time-based
        'Tenderloin shooting 6:12 AM',
        'Tenderloin shooting early morning December',
        'Turk Street shooting early morning',
        // Car-related
        'man shot car Tenderloin',
        'fatal shooting car Turk Street',
        'homicide car Tenderloin',
        // Additional variations
        'Tenderloin homicide ',
        'Turk Street homicide December',
        'San Francisco Tenderloin homicide'
      ]
    },
    {
      title: "Unidentified person shoots 1 man at Market Street, North Oakland",
      location: "5900 block of Market Street, North Oakland",
      coordinates: { lat: 37.8044, lng: -122.2711 }, // North Oakland
      timestamp: "2025-12-06T06:00:00Z", // 10:00 PM PT Dec 5 = 6:00 AM UTC Dec 6
      description: "Man from San Leandro shot at around 10:00 p.m. on the 5900 block of Market Street; he later died at hospital. Police responded after automated gunfire detection alert. SFGATE.",
      searchQueries: [
        // Direct location variations
        'Oakland shooting Market Street ',
        'North Oakland shooting 5900 Market Street',
        'Oakland shooting Market Street December 5',
        'Market Street Oakland shooting December',
        '5900 Market Street Oakland shooting',
        // Homicide related
        'Oakland homicide Market Street San Leandro',
        'Oakland homicide Market Street December',
        'North Oakland homicide Market Street',
        'Oakland fatal shooting Market Street',
        // San Leandro connection
        'San Leandro man shot Oakland',
        'San Leandro Market Street shooting',
        'Oakland shooting San Leandro man',
        // Police and automated detection
        'Oakland PD Market Street shooting December 5',
        'Oakland police Market Street shooting',
        'automated gunfire detection Oakland',
        'gunfire detection Market Street Oakland',
        // News sources
        'from:SFGATE Oakland',
        'from:SFGATE Market Street',
        'SFGATE Oakland shooting',
        'SFGATE Market Street shooting',
        // Time-based
        'Oakland shooting 10 PM December 5',
        'Oakland shooting night December 5',
        'Market Street shooting night Oakland',
        // Additional variations
        'North Oakland shooting ',
        'Oakland East Bay shooting December',
        'Market Street Oakland homicide December'
      ]
    },
    {
      title: "Unidentified person shoots 5 people near Safeway, Outer Richmond",
      location: "Great Highway and Fulton Street, Outer Richmond, San Francisco",
      coordinates: { lat: 37.7715, lng: -122.5045 }, // Outer Richmond area
      timestamp: "2025-11-08T20:00:00Z", // Nov 8, 2025
      description: "Shooting near the Safeway / Great Highway + Fulton Street left five people wounded (a mix of juveniles and at least one adult); one man was in life-threatening condition. Police believe it stemmed from a fight. ABC7 San Francisco. Los Angeles Times.",
      searchQueries: [
        // Direct location variations
        'Outer Richmond shooting Safeway ',
        'Great Highway Fulton Street shooting November',
        'Safeway Great Highway shooting San Francisco',
        'Outer Richmond shooting ',
        'Great Highway shooting Fulton Street November',
        // 5 wounded
        'Outer Richmond shooting 5 wounded',
        'Great Highway shooting 5 people',
        'San Francisco shooting 5 wounded November',
        'Outer Richmond 5 wounded shooting',
        // Fight-related
        'Outer Richmond shooting fight',
        'Great Highway shooting fight November',
        'Safeway shooting fight San Francisco',
        // Life-threatening
        'Outer Richmond shooting life-threatening',
        'Great Highway shooting life-threatening condition',
        'San Francisco shooting life-threatening November',
        // News sources
        'from:ABC7SF Outer Richmond',
        'from:ABC7SF Great Highway',
        'ABC7 San Francisco Outer Richmond',
        'Los Angeles Times Outer Richmond',
        'from:latimes San Francisco shooting',
        // Additional variations
        'Outer Richmond shooting ',
        'Great Highway Fulton shooting November',
        'San Francisco Outer Richmond shooting',
        'Richmond District shooting '
      ]
    },
    {
      title: "2 juveniles shoot 1 student at Skyline High School",
      location: "Skyline High School, Oakland",
      coordinates: { lat: 37.7894, lng: -122.1614 }, // Skyline High School
      timestamp: "2025-11-12T21:30:00Z", // Nov 12, 2025 around 1:30 PM PT = 21:30 UTC
      description: "Juvenile student was shot on campus around 1:30 p.m.; two juvenile suspects were taken into custody and two guns recovered. The student is expected to survive. KTVU FOX 2 San Francisco. KQED.",
      searchQueries: [
        // Direct school name variations
        'Skyline High School shooting ',
        'Skyline High School shooting ',
        'Skyline High School Oakland shooting',
        'Oakland Skyline High School shooting',
        // Student shot
        'Skyline High School student shot',
        'Oakland school shooting ',
        'Oakland school shooting ',
        'Skyline High School campus shooting',
        // Juvenile suspects
        'Skyline High School juvenile suspects',
        'Skyline High School 2 suspects custody',
        'Skyline High School 2 guns recovered',
        // Time-based
        'Skyline High School shooting 1:30 PM',
        'Skyline High School shooting afternoon November',
        // News sources
        'from:KTVU Skyline',
        'from:KTVU Oakland school',
        'KTVU FOX 2 Skyline High School',
        'from:KQED Skyline',
        'from:KQED Oakland school',
        'KQED Skyline High School shooting',
        // Additional variations
        'Oakland high school shooting ',
        'Skyline High School incident November',
        'Oakland school shooting '
      ]
    },
    {
      title: "Unidentified person shoots 1 staff member at Laney College",
      location: "Laney College field house, Oakland",
      coordinates: { lat: 37.7974, lng: -122.2653 }, // Laney College
      timestamp: "2025-11-13T20:00:00Z", // Nov 13, 2025
      description: "Senior athletics-staff member was shot inside the college's field house. The shooting came one day after the Skyline High School shooting. Police investigated; the victim was hospitalized. AP News. Wikipedia.",
      searchQueries: [
        // Direct location variations
        'Laney College shooting ',
        'Laney College shooting ',
        'Laney College field house shooting',
        'Laney College Oakland shooting',
        'Oakland Laney College shooting',
        // Staff member
        'Laney College staff member shot',
        'Laney College athletics staff shot',
        'Laney College field house staff shot',
        // After Skyline
        'Laney College shooting day after Skyline',
        'Laney College Skyline High School shooting',
        'Oakland college shooting after school shooting',
        // News sources
        'from:AP Laney College',
        'from:AP Oakland college',
        'AP News Laney College shooting',
        'Wikipedia Laney College shooting',
        // Additional variations
        'Oakland college shooting ',
        'Laney College shooting ',
        'Oakland community college shooting'
      ]
    },
    {
      title: "Suspect shoots 1 staff member at Laney College (fatal)",
      location: "Laney College, Oakland",
      coordinates: { lat: 37.7974, lng: -122.2653 }, // Laney College
      timestamp: "2025-11-14T20:00:00Z", // Nov 13-14, 2025
      description: "The staff-member shot above later died after being shot; suspect arrested. The victim was a well-known former coach and athletics director. Wikipedia. The Guardian.",
      searchQueries: [
        // Fatal shooting
        'Laney College shooting death ',
        'Laney College staff member died',
        'Laney College fatal shooting November',
        'Laney College coach died shooting',
        'Laney College athletics director died',
        // Suspect arrested
        'Laney College shooting suspect arrested',
        'Laney College shooting arrest November',
        'Oakland Laney College suspect custody',
        // Former coach
        'Laney College former coach shot',
        'Laney College athletics director shot',
        'Laney College coach shooting November',
        // News sources
        'from:AP Laney College death',
        'Wikipedia Laney College death',
        'from:guardian Laney College',
        'The Guardian Laney College shooting',
        // Additional variations
        'Laney College shooting ',
        'Oakland college shooting death November',
        'Laney College homicide '
      ]
    },
    {
      title: "Multiple shooters kill 4 people at Monkey Space event hall, Stockton",
      location: "Monkey Space event hall, Stockton",
      coordinates: { lat: 37.9577, lng: -121.2908 }, // Stockton
      timestamp: "2025-11-29T20:00:00Z", // Nov 29, 2025
      description: "Mass shooting at a children's birthday-party event: 4 people killed (3 children) and many more wounded. The shooting appears targeted; multiple shooters suspected. AP News. Wikipedia.",
      searchQueries: [
        // Direct location variations
        'Monkey Space Stockton shooting ',
        'Monkey Space event hall shooting',
        'Stockton Monkey Space shooting ',
        'Stockton event hall shooting November',
        'Monkey Space birthday party shooting',
        // Mass shooting
        'Stockton mass shooting ',
        'Stockton mass shooting ',
        'Monkey Space mass shooting',
        'Stockton birthday party mass shooting',
        // 4 killed, 3 children
        'Stockton shooting 4 killed',
        'Monkey Space shooting 4 killed',
        'Stockton shooting 3 children killed',
        'Monkey Space 3 children killed',
        'Stockton shooting children killed November',
        // Multiple shooters
        'Stockton shooting multiple shooters',
        'Monkey Space multiple shooters',
        'Stockton targeted shooting November',
        'Monkey Space targeted shooting',
        // News sources
        'from:AP Stockton',
        'from:AP Monkey Space',
        'AP News Stockton shooting',
        'AP News Monkey Space',
        'Wikipedia Stockton shooting',
        'Wikipedia Monkey Space shooting',
        // Additional variations
        'Stockton children birthday party shooting',
        'San Joaquin County mass shooting November',
        'Stockton event hall mass shooting',
        'Monkey Space Stockton '
      ]
    }
  ];

  const incidents: Incident[] = [];

  for (const incidentData of hardcodedIncidents) {
    try {
      // Search for posts about this incident using multiple queries
      const allPosts: XPost[] = [];
      const postsMap = new Map<string, XPost>();

      // Search with maximum results per query to get LOTS of posts
      for (const searchQuery of incidentData.searchQueries) {
        try {
          // Use maximum allowed (100) to get as many posts as possible
          const tweets = await searchTweets(searchQuery, 100);
          tweets.forEach(tweet => {
            if (!postsMap.has(tweet.id)) {
              postsMap.set(tweet.id, tweet);
            }
          });
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error searching for "${searchQuery}":`, error);
        }
      }

      // Filter out posts with very low engagement
      let posts = Array.from(postsMap.values());
      posts = filterLowEngagementPosts(posts);

      // Only create placeholder if we truly have NO posts after searching all queries
      // This should rarely happen if the API is working correctly
      if (posts.length === 0) {
        console.warn(`No posts found for incident: ${incidentData.title}. This may indicate API issues or the incident is too old.`);
        // Don't create placeholder - skip this incident if no real data
        // This ensures we only show incidents with actual X API data
        continue;
      }

      // Calculate metrics
      const totalEngagement = calculateTotalEngagement(posts);
      const sentiment = analyzeSentiment(posts);
      // Determine severity: mass shootings and fatal incidents are critical/high
      let severity: Severity = 'medium';
      if (incidentData.description.includes('mass shooting') || incidentData.description.includes('4 people killed') || incidentData.description.includes('3 children killed')) {
        severity = 'critical';
      } else if (incidentData.description.includes('fatally') || incidentData.description.includes('died') || incidentData.description.includes('killed')) {
        severity = 'high';
      } else if (incidentData.description.includes('life-threatening')) {
        severity = 'high';
      }
      
      // Generate TLDR
      const tldrResult = generateTLDR(posts, incidentData.location);

      // Create incident
      const incident: Incident = {
        id: uuidv4(),
        title: incidentData.title,
        severity,
        location: incidentData.location,
        timestamp: incidentData.timestamp,
        description: incidentData.description,
        coordinates: incidentData.coordinates,
        discussion: {
          shooterStatus: severity === 'high' ? 'Under Investigation' : 'Suspect in Custody',
          userSummary: tldrResult.summary || incidentData.description,
          tldrCitations: tldrResult.citations,
          sources: posts,
          totalEngagement,
        },
      };

      incidents.push(incident);
    } catch (error) {
      console.error(`Error processing hardcoded incident "${incidentData.title}":`, error);
    }
  }

  return incidents;
};

// Main function to fetch real-time incidents from X - search all Bay Area cities
export const fetchRealTimeIncidents = async (query: string = ""): Promise<FetchIncidentsResponse> => {
  try {
    // Always fetch hardcoded incidents first
    const hardcodedIncidents = await fetchHardcodedIncidents();
    
    // If custom query provided, use it
    if (query && query.trim() !== "") {
      const tweets = await searchTweets(query, 100);
      if (tweets.length === 0) {
        return { incidents: [] };
      }
      
      const allPosts: XPost[] = tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        author: tweet.author,
        url: tweet.url,
        timestamp: tweet.timestamp,
        engagement: tweet.engagement,
        media: tweet.media || [],
      }));
      
      // Filter out posts with any engagement metric < 5
      const filteredPosts = filterLowEngagementPosts(allPosts);
      
      const incidentGroups = groupPostsByIncident(filteredPosts);
      const incidents: Incident[] = [];
      
      incidentGroups.forEach((group) => {
        const posts = group.posts;
        const anchoredLocation = group.location;
        
        const sentiment = analyzeSentiment(posts);
        // More lenient reliability check - allow posts with at least 1 post if it has engagement
        const isReliable = sentiment.sentiment !== 'negative' && (sentiment.verifiedCount > 0 || sentiment.confidence > 0.6 || posts.length >= 1);
        
        // Only skip if we have very few posts AND they're not reliable
        if (!isReliable && posts.length < 2) {
          return;
        }
        
        const totalEngagement = calculateTotalEngagement(posts);
        const severity = determineSeverity(posts);
        const location = anchoredLocation || extractLocation(posts);
        const coordinates = getCoordinates(location);
        const tldrResult = generateTLDR(posts, location);
        const timestamps = posts.map(p => new Date(p.timestamp).getTime());
        const mostRecent = new Date(Math.max(...timestamps)).toISOString();
        
        const generateTitle = (posts: XPost[], incidentLocation: string): string => {
          // Sort posts by engagement to get most detailed/reliable post
          const sortedPosts = [...posts].sort((a, b) => {
            const engagementA = a.engagement.likes + a.engagement.retweets;
            const engagementB = b.engagement.likes + b.engagement.retweets;
            return engagementB - engagementA;
          });

          let actor = '';
          let action = '';
          let victims = '';

          // Try to extract actor, action, and victims from posts
          for (const post of sortedPosts) {
            const text = post.text;
            const textLower = text.toLowerCase();

            // Extract actor (man/woman/person/suspect/shooter)
            if (!actor) {
              const actorPatterns = [
                /\b(man|woman|teen|teenager|juvenile|suspect|shooter|gunman|individual|person)\b/i,
                /\b(\d+(?:-year-old)?)\s+(man|woman|male|female)\b/i,
              ];

              for (const pattern of actorPatterns) {
                const match = text.match(pattern);
                if (match) {
                  if (match[2]) {
                    // "25-year-old man"
                    actor = `${match[1]} ${match[2]}`;
                  } else {
                    actor = match[1];
                  }
                  // Capitalize first letter
                  actor = actor.charAt(0).toUpperCase() + actor.slice(1);
                  break;
                }
              }
            }

            // Extract action
            if (!action) {
              if (textLower.includes('shooting') || textLower.includes('shots fired') || textLower.includes('shot')) {
                action = 'shoots';
              } else if (textLower.includes('stabbing') || textLower.includes('stabbed')) {
                action = 'stabs';
              } else if (textLower.includes('arrested')) {
                action = 'arrested at';
              } else if (textLower.includes('assault')) {
                action = 'assaults';
              } else if (textLower.includes('attack')) {
                action = 'attacks';
              }
            }

            // Extract victims (number of people, specific person descriptions)
            if (!victims) {
              const victimPatterns = [
                /(?:shot|killed|injured|wounded)\s+(\d+)\s+(people|person|victim|individual)s?/i,
                /(\d+)\s+(people|person|victim|individual)s?\s+(?:shot|killed|injured|wounded)/i,
                /(?:shot|killed|injured|wounded)\s+(?:a\s+)?(man|woman|teen|person|individual)/i,
                /shooting\s+(?:at\s+)?(\d+)\s+(people|victim)/i,
              ];

              for (const pattern of victimPatterns) {
                const match = text.match(pattern);
                if (match) {
                  if (match[1] && match[2]) {
                    // "2 people" or "3 victims"
                    victims = `${match[1]} ${match[2]}${match[1] !== '1' && !match[2].endsWith('s') ? 's' : ''}`;
                  } else if (match[1]) {
                    // "man" or "woman"
                    victims = match[1].toLowerCase();
                  }
                  break;
                }
              }
            }

            if (actor && action) break;
          }

          // Build title in format "Actor action victims at Location"
          let title = '';

          if (actor && action) {
            title = actor;
            if (action === 'arrested at') {
              title += ` ${action}`;
            } else if (victims) {
              title += ` ${action} ${victims} at`;
            } else {
              title += ` ${action} at`;
            }
            title += ` ${incidentLocation}`;
          } else if (action) {
            // Fallback: "Shooting at Location"
            const actionMap: Record<string, string> = {
              'shoots': 'Shooting',
              'stabs': 'Stabbing',
              'assaults': 'Assault',
              'attacks': 'Attack',
              'arrested at': 'Arrest'
            };
            title = `${actionMap[action] || 'Incident'} at ${incidentLocation}`;
          } else {
            // Final fallback
            const topPost = sortedPosts[0];
            const text = topPost.text.toLowerCase();
            let incidentType = 'Incident';
            if (text.includes('shooting') || text.includes('shots fired')) {
              incidentType = 'Shooting';
            } else if (text.includes('stabbing')) {
              incidentType = 'Stabbing';
            } else if (text.includes('arrest')) {
              incidentType = 'Arrest';
            }
            title = `${incidentType} at ${incidentLocation}`;
          }

          return title;
        };
        
        const reliabilityNote = sentiment.verifiedCount > 0 
          ? `Verified by ${sentiment.verifiedCount} official sources. ` 
          : sentiment.confidence > 0.7 
          ? 'High confidence from multiple sources. ' 
          : '';
        
        incidents.push({
          id: uuidv4(),
          title: generateTitle(posts, location),
          severity,
          location,
          timestamp: mostRecent,
          description: `${reliabilityNote}Real-time event detected from ${posts.length} X posts with ${totalEngagement.totalLikes + totalEngagement.totalRetweets} total engagements.`,
          coordinates,
          discussion: {
            shooterStatus: severity === 'critical' ? 'Active Investigation' : severity === 'high' ? 'Monitoring' : 'Verified',
            userSummary: tldrResult.summary,
            tldrCitations: tldrResult.citations,
            sources: posts,
            totalEngagement,
          },
        });
      });
      
      // Merge hardcoded incidents with custom query results
      const allIncidents = [...hardcodedIncidents, ...incidents];
      
      return { incidents: allIncidents.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        const aEngagement = a.discussion.totalEngagement.totalLikes + a.discussion.totalEngagement.totalRetweets;
        const bEngagement = b.discussion.totalEngagement.totalLikes + b.discussion.totalEngagement.totalRetweets;
        return bEngagement - aEngagement;
      }) };
    }
    
    // Default: Search all Bay Area cities separately + police reports + general Bay Area search
    const bayAreaCities = [
      'San Jose',
      'Palo Alto',
      'Stanford',
      'Menlo Park',
      'Mountain View',
      'Redwood City',
      'East Palo Alto',
      'Santa Clara',
      'Cupertino',
      'Sunnyvale',
      'Fremont',
      'Milpitas',
      '"Westfield Valley Fair"',
      'Valley Fair'
    ];
    
    // Add general Bay Area real-time searches
    const generalBayAreaQueries = [
      '(shooting OR "shots fired" OR "active shooter" OR gunfire) (Bay Area OR "San Francisco Bay" OR "SF Bay") -is:retweet lang:en',
      '(police OR emergency OR incident) (Bay Area OR "San Francisco Bay") -is:retweet lang:en',
      '(breaking OR alert) (Bay Area OR "San Francisco Bay") -is:retweet lang:en',
    ];
    
    console.log('Searching for real-time incidents in Bay Area...');
    
    // Search each city in parallel + police reports + general Bay Area
    const [citySearches, policeReports, generalSearches] = await Promise.all([
      Promise.all(bayAreaCities.map(city => searchByCity(city, 24))),
      searchPoliceReports(),
      Promise.all(generalBayAreaQueries.map(query => {
        return searchTweets(query, 100).then(tweets => tweets.map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          author: tweet.author,
          url: tweet.url,
          timestamp: tweet.timestamp,
          engagement: tweet.engagement,
          media: tweet.media || [],
        }))).catch(err => {
          console.error(`Error in general search "${query}":`, err);
          return [];
        });
      }))
    ]);
    
    const allGeneralPosts = generalSearches.flat();
    console.log(`Found ${citySearches.flat().length} posts from city searches, ${policeReports.length} police reports, and ${allGeneralPosts.length} from general Bay Area searches`);
    
    // Combine all posts and remove duplicates
    const allPostsMap = new Map<string, XPost>();
    
    // Add city search results
    citySearches.flat().forEach(post => {
      if (!allPostsMap.has(post.id)) {
        allPostsMap.set(post.id, post);
      }
    });
    
    // Add police reports (mark as verified)
    policeReports.forEach(post => {
      if (!allPostsMap.has(post.id)) {
        // Mark police posts as verified
        post.author.verified = true;
        allPostsMap.set(post.id, post);
      }
    });
    
    // Add general Bay Area search results
    allGeneralPosts.forEach(post => {
      if (!allPostsMap.has(post.id)) {
        allPostsMap.set(post.id, post);
      }
    });
    
    // Filter out posts with very low engagement (but be lenient)
    const allPosts = filterLowEngagementPosts(Array.from(allPostsMap.values()));
    
    console.log(`After filtering: ${allPosts.length} posts with engagement`);
    
    if (allPosts.length === 0) {
      console.warn('No posts found with engagement. Returning hardcoded incidents only.');
      // Still return hardcoded incidents even if no other posts found
      return { incidents: hardcodedIncidents };
    }
    
    // Group posts into multiple incidents by location
    const incidentGroups = groupPostsByIncident(allPosts);
    
    const incidents: Incident[] = [];
    
    incidentGroups.forEach((group) => {
      const posts = group.posts;
      const anchoredLocation = group.location;
      
      // Analyze sentiment and verify accuracy
      const sentiment = analyzeSentiment(posts);
      
      // More lenient reliability check - allow real-time incidents with engagement
      const isReliable = sentiment.sentiment !== 'negative' && (sentiment.verifiedCount > 0 || sentiment.confidence > 0.6 || posts.length >= 1);
      
      // Only skip if we have very few posts AND they're not reliable
      if (!isReliable && posts.length < 2) {
        return; // Skip unreliable incidents with very few sources
      }
      
      // Calculate metrics - use anchored location from grouping
      const totalEngagement = calculateTotalEngagement(posts);
      const severity = determineSeverity(posts);
      const location = anchoredLocation || extractLocation(posts);
      const coordinates = getCoordinates(location);
      const tldrResult = generateTLDR(posts, location);
      const tldr = tldrResult.summary;
      const tldrCitations = tldrResult.citations;
      
      // Get most recent timestamp
      const timestamps = posts.map(p => new Date(p.timestamp).getTime());
      const mostRecent = new Date(Math.max(...timestamps)).toISOString();
      
      // Generate narrative title - "Actor action victims at Location"
      const generateTitle = (posts: XPost[], incidentLocation: string): string => {
        // Sort posts by engagement to get most detailed/reliable post
        const sortedPosts = [...posts].sort((a, b) => {
          const engagementA = a.engagement.likes + a.engagement.retweets;
          const engagementB = b.engagement.likes + b.engagement.retweets;
          return engagementB - engagementA;
        });

        let actor = '';
        let action = '';
        let victims = '';

        // Try to extract actor, action, and victims from posts
        for (const post of sortedPosts) {
          const text = post.text;
          const textLower = text.toLowerCase();

          // Extract actor (man/woman/person/suspect/shooter)
          if (!actor) {
            const actorPatterns = [
              /\b(man|woman|teen|teenager|juvenile|suspect|shooter|gunman|individual|person)\b/i,
              /\b(\d+(?:-year-old)?)\s+(man|woman|male|female)\b/i,
            ];

            for (const pattern of actorPatterns) {
              const match = text.match(pattern);
              if (match) {
                if (match[2]) {
                  // "25-year-old man"
                  actor = `${match[1]} ${match[2]}`;
                } else {
                  actor = match[1];
                }
                // Capitalize first letter
                actor = actor.charAt(0).toUpperCase() + actor.slice(1);
                break;
              }
            }
          }

          // Extract action
          if (!action) {
            if (textLower.includes('shooting') || textLower.includes('shots fired') || textLower.includes('shot')) {
              action = 'shoots';
            } else if (textLower.includes('stabbing') || textLower.includes('stabbed')) {
              action = 'stabs';
            } else if (textLower.includes('arrested')) {
              action = 'arrested at';
            } else if (textLower.includes('assault')) {
              action = 'assaults';
            } else if (textLower.includes('attack')) {
              action = 'attacks';
            }
          }

          // Extract victims (number of people, specific person descriptions)
          if (!victims) {
            const victimPatterns = [
              /(?:shot|killed|injured|wounded)\s+(\d+)\s+(people|person|victim|individual)s?/i,
              /(\d+)\s+(people|person|victim|individual)s?\s+(?:shot|killed|injured|wounded)/i,
              /(?:shot|killed|injured|wounded)\s+(?:a\s+)?(man|woman|teen|person|individual)/i,
              /shooting\s+(?:at\s+)?(\d+)\s+(people|victim)/i,
            ];

            for (const pattern of victimPatterns) {
              const match = text.match(pattern);
              if (match) {
                if (match[1] && match[2]) {
                  // "2 people" or "3 victims"
                  victims = `${match[1]} ${match[2]}${match[1] !== '1' && !match[2].endsWith('s') ? 's' : ''}`;
                } else if (match[1]) {
                  // "man" or "woman"
                  victims = match[1].toLowerCase();
                }
                break;
              }
            }
          }

          if (actor && action) break;
        }

        // Build title in format "Actor action victims at Location"
        let title = '';

        if (actor && action) {
          title = actor;
          if (action === 'arrested at') {
            title += ` ${action}`;
          } else if (victims) {
            title += ` ${action} ${victims} at`;
          } else {
            title += ` ${action} at`;
          }
          title += ` ${incidentLocation}`;
        } else if (action) {
          // Fallback: "Shooting at Location"
          const actionMap: Record<string, string> = {
            'shoots': 'Shooting',
            'stabs': 'Stabbing',
            'assaults': 'Assault',
            'attacks': 'Attack',
            'arrested at': 'Arrest'
          };
          title = `${actionMap[action] || 'Incident'} at ${incidentLocation}`;
        } else {
          // Final fallback
          const topPost = sortedPosts[0];
          const text = topPost.text.toLowerCase();
          let incidentType = 'Incident';
          if (text.includes('shooting') || text.includes('shots fired')) {
            incidentType = 'Shooting';
          } else if (text.includes('stabbing')) {
            incidentType = 'Stabbing';
          } else if (text.includes('arrest')) {
            incidentType = 'Arrest';
          }
          title = `${incidentType} at ${incidentLocation}`;
        }

        return title;
      };
      
      // Add reliability indicator
      const reliabilityNote = sentiment.verifiedCount > 0 
        ? `Verified by ${sentiment.verifiedCount} official sources. ` 
        : sentiment.confidence > 0.7 
        ? 'High confidence from multiple sources. ' 
        : '';
      
      // Create incident
      const incident: Incident = {
        id: uuidv4(),
        title: generateTitle(posts, location),
        severity,
        location,
        timestamp: mostRecent,
        description: `${reliabilityNote}Real-time event detected from ${posts.length} X posts with ${totalEngagement.totalLikes + totalEngagement.totalRetweets} total engagements.`,
        coordinates,
        discussion: {
          shooterStatus: severity === 'critical' ? 'Active Investigation' : severity === 'high' ? 'Monitoring' : 'Verified',
          userSummary: tldr,
          tldrCitations: tldrCitations,
          sources: posts,
          totalEngagement,
        },
      };
      
      incidents.push(incident);
    });
    
    // Merge hardcoded incidents with regular incidents
    const allIncidents = [...hardcodedIncidents, ...incidents];
    
    console.log(`Total incidents found: ${allIncidents.length} (${hardcodedIncidents.length} hardcoded, ${incidents.length} real-time)`);
    
    return {
      incidents: allIncidents.sort((a, b) => {
        // Sort by severity and engagement
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        
        const aEngagement = a.discussion.totalEngagement.totalLikes + a.discussion.totalEngagement.totalRetweets;
        const bEngagement = b.discussion.totalEngagement.totalLikes + b.discussion.totalEngagement.totalRetweets;
        return bEngagement - aEngagement;
      }),
    };
    
  } catch (error: any) {
    console.error("X API Error in fetchRealTimeIncidents:", error);
    
    // Provide more detailed error messages
    let errorMessage = "Failed to fetch incidents from X API.";
    
    if (error.message) {
      if (error.message.includes("Authentication failed") || error.message.includes("401")) {
        errorMessage = "X API Authentication failed. Please check your API credentials in .env.local file.";
      } else if (error.message.includes("Rate limit") || error.message.includes("429")) {
        errorMessage = "X API Rate limit exceeded. Please wait a few minutes and try again.";
      } else if (error.message.includes("Access forbidden") || error.message.includes("403")) {
        errorMessage = "X API Access forbidden. Please check your API permissions and ensure you have access to the Twitter API v2.";
      } else if (error.message.includes("Connection") || error.message.includes("network")) {
        errorMessage = "Network error connecting to X API. Please check your internet connection.";
      } else {
        errorMessage = `X API Error: ${error.message}`;
      }
    }
    
    throw new Error(errorMessage);
  }
};

