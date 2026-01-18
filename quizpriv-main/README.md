# Quiz Generator

Converts meeting transcripts into MCQ questions using AI. Upload a transcript, get organized quiz questions grouped by topic.

Backend (port 8001):
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

Frontend (port 5173):
npm install
npm run dev

MongoDB: Needs to be running on localhost:27017

Key Files:
Backend:

main.py - API endpoints, question generation, LangChain logic
server/app/db.py - MongoDB connection

Frontend:

src/pages/TranscriptUpload.tsx - File upload + generation UI
src/pages/QuestionBank.tsx - Display questions by subtopic
src/components/Layout.tsx - Sidebar navigation