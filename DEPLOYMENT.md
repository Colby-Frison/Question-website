# Deployment Guide for Classroom Q&A

This guide provides detailed instructions for deploying the Classroom Q&A application to various hosting platforms.

## Preparing for Deployment

Before deploying, make sure to:

1. **Replace the Firebase configuration** in `src/lib/firebase.ts` with your actual Firebase project details
2. **Set up Firestore security rules** in your Firebase console
3. **Test your application locally** to ensure everything works correctly
4. **Build your application** to make sure there are no build errors

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

5. **Add environment variables** (optional)
   - If you're using environment variables for Firebase configuration, add them here
   - Format: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, etc.

6. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your application
   - Once complete, you'll get a URL where your application is hosted

7. **Set up a custom domain** (optional)
   - In your project settings, go to "Domains"
   - Add your custom domain and follow the instructions

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
   - Click "Deploy site"

4. **Set up environment variables** (if needed)
   - Go to Site settings > Build & deploy > Environment
   - Add your environment variables

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
     };
     
     module.exports = nextConfig;
     ```

5. **Build your project**
   ```bash
   npm run build
   ```

6. **Deploy to Firebase**
   ```bash
   firebase deploy
   ```

## Post-Deployment Steps

After deploying your application, make sure to:

1. **Test your deployed application** thoroughly
2. **Add your deployment domain to Firebase authorized domains**:
   - Go to Firebase Console > Authentication > Sign-in method > Authorized domains
   - Add your deployment domain (e.g., `your-app.vercel.app`)
3. **Monitor your application** for any errors or issues
4. **Set up analytics** to track usage (optional)

## Troubleshooting Deployment Issues

If you encounter issues during deployment:

1. **Check the deployment logs** provided by your hosting platform
2. **Verify your Firebase configuration** is correct
3. **Ensure your Firestore security rules** are properly set up
4. **Test Firebase connectivity** in the deployed environment
5. **Check browser console** for any errors

For more detailed troubleshooting, refer to the [Troubleshooting Guide](TROUBLESHOOTING.md). 