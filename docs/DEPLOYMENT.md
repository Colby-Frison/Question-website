# Deployment Guide for Classroom Q&A

This guide provides detailed instructions for deploying the Classroom Q&A application to various hosting platforms.

## Preparing for Deployment

Before deploying, make sure to:

1. **Replace the Firebase configuration** in `src/lib/firebase.ts` with your actual Firebase project details
2. **Set up Firestore security rules** in your Firebase console (see below for updated rules)
3. **Create required Firestore indexes** for optimal performance
4. **Test your application locally** with both light and dark themes to ensure theme switching works correctly
5. **Verify both professor and student workflows** function as expected
6. **Build your application** to make sure there are no build errors: `npm run build`

## Deploying to Vercel (Recommended)

Vercel is the platform created by the team behind Next.js and offers the simplest deployment experience.

### Steps to deploy to Vercel:

1. **Create a Vercel account**
   - Sign up at [vercel.com](https://vercel.com)

2. **Push your code to a Git repository**
   - GitHub, GitLab, or Bitbucket

3. **Import your repository in Vercel**
   - Go to your Vercel dashboard
   - Click "Add New" > "Project"
   - Select your repository
   - Vercel will automatically detect that it's a Next.js project

4. **Configure your project**
   - Project Name: Choose a name for your project
   - Framework Preset: Next.js (should be auto-detected)
   - Root Directory: `./` (if your code is in the root of the repository)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)

5. **Add environment variables**
   - Format: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, etc.
   - Required Firebase variables:
     ```
     NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
     NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
     NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id (optional, for analytics)
     ```
   - Optional configuration variables:
     ```
     NEXT_PUBLIC_DEFAULT_THEME=system (options: light, dark, system)
     NEXT_PUBLIC_QUESTION_MAX_LENGTH=1000 (default character limit for questions)
     ```

6. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your application
   - Once complete, you'll get a URL where your application is hosted

7. **Set up a custom domain** (optional)
   - In your project settings, go to "Domains"
   - Add your custom domain and follow the instructions

8. **Verify functionality post-deployment**
   - Test both professor and student flows
   - Verify theme switching works correctly
   - Test class creation, joining, and question management
   - Ensure responsive design works on mobile devices

## Deploying to Netlify

Netlify is another excellent platform for deploying Next.js applications.

### Steps to deploy to Netlify:

1. **Create a Netlify account**
   - Sign up at [netlify.com](https://netlify.com)

2. **Prepare your project**
   - Create a `netlify.toml` file in your project root:
     ```toml
     [build]
       command = "npm run build"
       publish = ".next"

     [[plugins]]
       package = "@netlify/plugin-nextjs"
     ```
   - Install the Netlify plugin: `npm install -D @netlify/plugin-nextjs`

3. **Deploy using the Netlify UI**
   - Go to your Netlify dashboard
   - Click "New site from Git"
   - Select your Git provider and repository
   - Configure build settings:
     - Build command: `npm run build`
     - Publish directory: `.next`
   - Add environment variables (same as in Vercel section)
   - Click "Deploy site"

4. **Enable Functions** (required for server-side components)
   - In your site settings, go to "Functions"
   - Ensure functions are enabled and properly configured

## Deploying to Firebase Hosting

Since you're already using Firebase for the database, you might consider using Firebase Hosting as well.

### Steps to deploy to Firebase Hosting:

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Initialize Firebase in your project**
   ```bash
   firebase init
   ```
   - Select "Hosting"
   - Select your Firebase project
   - Set "public" directory to "out"
   - Configure as a single-page app: "Yes"

4. **Update your Next.js configuration**
   - Modify `next.config.js`:
     ```javascript
     /** @type {import('next').NextConfig} */
     const nextConfig = {
       reactStrictMode: true,
       swcMinify: true,
       output: 'export',
       images: {
         unoptimized: true,
       },
     };
     
     module.exports = nextConfig;
     ```

5. **Build your project with static export**
   ```bash
   npm run build
   ```

6. **Deploy to Firebase**
   ```bash
   firebase deploy
   ```

7. **Note on SSR limitations**
   - Firebase Hosting has limitations with server-side rendering
   - Some Next.js 14 features may not work as expected
   - Consider Vercel or Netlify for full Next.js functionality

## Post-Deployment Steps

After deploying your application, make sure to:

1. **Test your deployed application** thoroughly
   - Test on multiple devices and browsers
   - Test dark and light theme functionality
   - Verify all professor and student workflows
   - Test question status toggling

2. **Add your deployment domain to Firebase authorized domains**:
   - Go to Firebase Console > Authentication > Sign-in method > Authorized domains
   - Add your deployment domain (e.g., `your-app.vercel.app`)

3. **Set up Firestore indexes**
   - Required index for the `questions` collection:
     - Fields: `classCode` (Ascending), `timestamp` (Descending)
   - Optional index for class sessions if you have many:
     - Fields: `code` (Ascending), `createdAt` (Descending)

4. **Update Firestore security rules**
   - Use the updated security rules from the README that support question status updates and class session management

5. **Monitor your application** for any errors or issues
   - Set up error monitoring with Sentry or similar tools
   - Use Firebase Performance Monitoring for tracking app performance

6. **Set up analytics** to track usage (optional)
   - Enable Google Analytics in Firebase console
   - Track key events like:
     - Class creation
     - Student joins
     - Questions asked
     - Questions answered

## Scaling Considerations

If your application grows in usage, consider these scaling tips:

1. **Enable Firebase caching**
   - Implement caching strategies for frequently accessed data
   - Use `next/cache` for server components when applicable

2. **Implement pagination for question lists**
   - Add limit and pagination to question queries to prevent loading too many questions at once

3. **Set up Firestore database indexes**
   - Create indexes for commonly queried fields to improve performance

4. **Consider Firebase billing limits**
   - Monitor your usage to avoid unexpected charges
   - Set up budget alerts in Google Cloud Console

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key | Required |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Required |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID | Required |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Required |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Required |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID | Required |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase measurement ID for analytics | Optional |
| `NEXT_PUBLIC_DEFAULT_THEME` | Default theme (light, dark, system) | "system" |
| `NEXT_PUBLIC_QUESTION_MAX_LENGTH` | Maximum character limit for questions | 1000 |

## Troubleshooting Deployment Issues

If you encounter issues during deployment:

1. **Check the deployment logs** provided by your hosting platform
2. **Verify your Firebase configuration** is correct
3. **Ensure your Firestore security rules** are properly set up
4. **Test Firebase connectivity** in the deployed environment
5. **Check browser console** for any errors
6. **Verify theme toggle functionality** works as expected
7. **Test class creation and session management**

For more detailed troubleshooting, refer to the [Troubleshooting Guide](TROUBLESHOOTING.md). 