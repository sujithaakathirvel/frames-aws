# Frames
[![AWS Amplify Deployment](https://img.shields.io/badge/AWS%20Amplify-Deployed-success?style=flat-square&logo=awsamplify)](https://main.d3ignice7rjhap.amplifyapp.com)
[![Serverless Architecture](https://img.shields.io/badge/Architecture-Serverless-FF9900?style=flat-square&logo=amazonaws)](https://aws.amazon.com/)
[![Amazon Cognito](https://img.shields.io/badge/Auth-Amazon%20Cognito-DD344C?style=flat-square&logo=amazoncognito)](https://aws.amazon.com/cognito/)
[![DynamoDB](https://img.shields.io/badge/Database-Amazon%20DynamoDB-4053D6?style=flat-square&logo=amazondynamodb)](https://aws.amazon.com/dynamodb/)

Frames is a serverless photo-sharing application that explores how far a production-style web application can go without a custom backend or API layer.

[🌐 **Live Production Application**](https://main.d3ignice7rjhap.amplifyapp.com)

---

## The Engineering Problem

Most cloud portfolio projects wire together AWS services and call it done. The harder question: how much of a traditional backend can you remove, and what has to be true when you do?

Frames - a small Instagram-style app with authentication, uploads, a feed, and likes - explores that question concretely. All application logic runs in the browser. There's no API layer and no compute service in the request path; every user action calls AWS directly via the SDK, authorized by short-lived, per-session IAM credentials from Cognito.

The interesting part isn't the CRUD features. It's what breaks, and what has to be locked down, when the server disappears.

---

## Architecture & Data Flow

![Frames Architecture](screenshots/frames-architecture.jpg)

---

## Key Engineering Decisions

| Decision | Reasoning | Trade-off Accepted |
| :--- | :--- | :--- |
| **No backend / API layer** | Tests how far Cognito Identity Pool + IAM can substitute for a server, letting users interact directly with AWS resources | No place to add server-side validation, rate limiting, or business logic without introducing a backend later |
| **Cognito Identity Pool for temporary STS credentials** | Avoids ever shipping static AWS access keys to the browser - the top credential-leak risk in client-side AWS apps | Security depends entirely on correct IAM role scoping; a misconfigured policy becomes a direct data-access bug |
| **DynamoDB `Scan` for the feed** | Simplest correct implementation to ship first | Doesn't scale past a small dataset; needs a GSI + `Query` for real traffic |
| **Optimistic UI with a plain overwrite for likes** | Fast perceived responsiveness | Not atomic - concurrent likes from different users can produce a lost update; should use an `ADD` expression |

---

## Features

- **Auth** - Cognito-backed sign up / sign in
- **Upload** - direct-to-S3 image upload, with metadata written to DynamoDB
- **Feed** - chronological post feed
- **Likes** - per-post like counter
- **Profile / delete** - user-scoped post management
- **Custom usernames** - stored in a separate profile table, keyed by Cognito user ID

---

## Security Model

- No static AWS credentials in the client - Cognito Identity Pool issues short-lived STS credentials per session via `fetchAuthSession`
- Access is enforced through IAM permissions associated with the authenticated Cognito Identity Pool role, rather than an application-layer API.
- S3 bucket CORS policy scopes allowed origins and methods for direct browser uploads

**Current gap:** IAM is scoped at the table/bucket level, not per user. Per-user S3 and DynamoDB access via Cognito identity-based IAM conditions is planned - see roadmap below.

---

## Known Limitations & Roadmap

| Limitation | Planned Fix |
| :--- | :--- |
| Feed uses a full table `Scan` | Add a GSI on `createdAt`; switch to `Query` with pagination |
| Like counter is non-atomic | Switch to `UpdateExpression: ADD likes :inc` |
| No image processing | Add an S3 event → Lambda for resize/thumbnail generation on upload |
| No server-side upload validation | Add a thin validation Lambda, or tighten IAM + S3 bucket policies (size, content-type) |
| Broad IAM scoping | Rewrite the Identity Pool's authenticated-role policy with per-user resource conditions (`${cognito-identity.amazonaws.com:sub}`) |

---

## Technology Stack

- **Frontend:** React, JavaScript (ES6+), CSS
- **Auth:** Amazon Cognito (User Pools + Identity Pools), AWS IAM
- **Data:** Amazon S3, Amazon DynamoDB
- **Hosting/CI-CD:** AWS Amplify Hosting
- **SDKs:** `@aws-sdk/client-s3`, `@aws-sdk/lib-dynamodb`, `aws-amplify` (Cognito auth client)
- **Tooling:** Git, npm

---

## Local Development

### Prerequisites
- [Node.js (v18+)](https://nodejs.org/) & npm
- An AWS account with a configured Cognito User Pool, Identity Pool, S3 bucket, and DynamoDB tables (`FramesPosts`, `UserProfiles`)

### Setup
```bash
git clone https://github.com/sujithaakathirvel/frames-aws.git
cd frames-aws/frontend
npm install

# Update src/aws-config.js with your own
# Cognito User Pool ID, Client ID, and Identity Pool ID

npm start
```

---

## Project Structure

```
frames-aws/
├── frontend/
│   ├── src/
│   │   ├── App.js         # Feed, upload, likes, profile logic
│   │   ├── aws-config.js  # Cognito configuration
│   │   ├── s3.js          # S3 client (Cognito-issued credentials)
│   │   ├── dynamodb.js    # DynamoDB client (Cognito-issued credentials)
│   │   └── index.js
│   └── public/
├── results/                # Performance test results
└── README.md
```

