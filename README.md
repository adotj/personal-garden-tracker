# Personal Garden Tracker

A full-stack web app to track plants, watering schedules, photos, and activity in my desert garden (Laveen, AZ).

**Live Demo:** [https://laveen-garden-tracker.vercel.app](https://laveen-garden-tracker.vercel.app)  
**Demo Password:** `demo` (safe read-only mode — no changes will be saved)

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + Storage), Tailwind CSS, shadcn/ui

### Features
- Add, edit, and delete plants with container type/size and watering frequency
- Upload and display photos for each plant (Supabase Storage)
- Smart, heat-aware watering reminders (adjusted for Arizona desert conditions)
- Full activity log showing who did what and when
- Dark mode toggle
- Separate demo mode for safe public viewing

### What I Learned
- Building and deploying a full-stack Next.js application from scratch
- Working with Supabase for database management, file storage, and Row Level Security
- Handling file uploads and automatic photo cleanup
- Implementing secure shared password protection using environment variables (instead of hardcoding credentials)
- Using `git-filter-repo` to rewrite Git history and completely remove exposed credentials from all previous commits
- Responsive design and modern UI development with Tailwind CSS and shadcn/ui
- Git workflow, Vercel deployment, and proper management of secrets

### Challenges Faced
- Debugging Supabase RLS policies for both the database and storage bucket
- Resolving repeated CORS, build, and TypeScript errors during development
- Learning how to securely handle credentials and clean sensitive data from Git history
- Building logic that adapts watering schedules based on real-time weather in extreme desert heat

### Future Improvements
- Replace shared password with full Supabase Auth (individual user accounts)
- Add plant search, filtering, and sorting
- Watering history charts and analytics
- Push notifications for watering reminders
- Export garden data as CSV

### Screenshots

![Main Dashboard](screenshots/dashboard.png)  
**Main dashboard with plants, weather widget, and activity log**

![Add New Plant](screenshots/add-plant.png)  
**Adding a new plant with photo upload**

![Activity Log](screenshots/activity-log.png)  
**Recent activity log**

![Dark Mode](screenshots/dark-mode.png)  
**Dark mode toggle**
