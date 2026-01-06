# QuizPriv - AI Quiz Generation System

An intelligent quiz generation system that converts meeting transcripts into quiz questions with automatic subtopic classification.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.12** or higher ([Download](https://www.python.org/downloads/))
- **Node.js 18** or higher ([Download](https://nodejs.org/))
- **MongoDB** (Local or Atlas) ([Download](https://www.mongodb.com/try/download/community))
- **Git** (optional, for cloning)

## 🚀 Quick Setup Guide

### Step 1: Extract the Project

Extract the ZIP file to your desired location:
```
quizpriv-main/
├── server/          # Backend (Python/FastAPI)
├── src/            # Frontend (React/TypeScript)
└── ...
```

### Step 2: Backend Setup

1. **Navigate to server directory:**
   ```bash
   cd quizpriv-main/server
   ```

2. **Create a Python virtual environment:**
   ```bash
   # Windows
   python -m venv .venv
   .venv\Scripts\activate

   # Mac/Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   
   Create a `.env` file in the `server` directory with:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   MODEL_NAME=llama-3.1-8b-instant
   MONGO_URI=mongodb://localhost:27017/
   MONGO_DB_NAME=myquiz_db
   ```

   **Get your Groq API Key:**
   - Go to [https://console.groq.com/keys](https://console.groq.com/keys)
   - Sign up/login and create a new API key
   - Copy the key to your `.env` file

5. **Start MongoDB:**
   ```bash
   # Windows (if installed as service)
   net start MongoDB

   # Mac (if installed via Homebrew)
   brew services start mongodb-community

   # Or run manually
   mongod --dbpath /path/to/your/data/directory
   ```

6. **Run the backend server:**
   ```bash
   # Make sure you're in the server directory with venv activated
   uvicorn app.main:app --reload --port 8001
   ```

   ✅ Backend should now be running at: `http://127.0.0.1:8001`

### Step 3: Frontend Setup

1. **Open a NEW terminal** (keep backend running)

2. **Navigate to project root:**
   ```bash
   cd quizpriv-main
   ```

3. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

4. **Start the frontend development server:**
   ```bash
   npm run dev
   ```

   ✅ Frontend should now be running at: `http://localhost:5173`

### Step 4: Access the Application

Open your browser and go to: **http://localhost:5173**

## 📦 Dependencies

### Backend (Python)
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `groq` - Groq AI API client
- `python-dotenv` - Environment variables
- `python-multipart` - File uploads
- `python-docx` - DOCX file parsing
- `pymongo` - MongoDB driver
- `langchain` - LLM framework
- `langchain-text-splitters` - Text chunking
- `sentence-transformers` - Embeddings
- `numpy` - Numerical operations

### Frontend (Node.js)
- `react` - UI framework
- `typescript` - Type safety
- `vite` - Build tool
- `tailwindcss` - Styling
- `lucide-react` - Icons

## 🎯 Features

- 📄 Upload transcripts (.txt, .docx)
- 🤖 AI-powered question generation
- 🏷️ Automatic subtopic classification
- 📊 Real-time progress tracking
- 💾 Persistent state (localStorage)
- 📱 Responsive design
- 📈 Performance analytics

## 🔧 Usage

1. **Upload Transcript:**
   - Drag & drop or browse for .txt/.docx files
   - Configure advanced options (optional)

2. **Generate Questions:**
   - Click "Generate Questions"
   - Watch real-time progress
   - View completion screen with statistics

3. **Review Questions:**
   - Navigate to "Question Bank"
   - Questions organized by subtopics
   - Export options available

## 🛠️ Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod --version`
- Check connection string in `.env`
- Default port: 27017

### Python Virtual Environment
```bash
# Deactivate current environment
deactivate

# Recreate virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Mac/Linux

# Reinstall dependencies
pip install -r requirements.txt
```

### Port Already in Use
```bash
# Change backend port in server command
uvicorn app.main:app --reload --port 8002

# Change frontend port in vite.config.ts
```

### Groq API Rate Limits
- Free tier: 6000 tokens per minute
- Reduce `num_questions` in Advanced Options
- Wait 1 minute between large uploads

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq AI API key (required) | - |
| `MODEL_NAME` | LLM model to use | llama-3.1-8b-instant |
| `MONGO_URI` | MongoDB connection string | mongodb://localhost:27017/ |
| `MONGO_DB_NAME` | Database name | myquiz_db |

## 🗂️ Project Structure

```
quizpriv-main/
├── server/
│   ├── app/
│   │   ├── main.py          # FastAPI application
│   │   └── db.py            # MongoDB connection
│   ├── requirements.txt      # Python dependencies
│   └── .env                 # Environment variables
├── src/
│   ├── pages/
│   │   ├── TranscriptUpload.tsx
│   │   ├── QuestionBank.tsx
│   │   ├── AIQuizAnswering.tsx
│   │   └── PerformanceAnalytics.tsx
│   ├── components/
│   └── App.tsx
├── package.json             # Node.js dependencies
└── README.md               # This file
```

## 🚨 Common Commands

```bash
# Backend
cd server
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Mac/Linux
uvicorn app.main:app --reload --port 8001

# Frontend
cd quizpriv-main
npm run dev

# MongoDB
mongod  # Start MongoDB
mongo   # MongoDB shell
```

## 📞 Support

For issues or questions:
1. Check MongoDB is running
2. Verify `.env` configuration
3. Ensure all dependencies are installed
4. Check console logs for errors

## 🔄 Updates

To update dependencies:
```bash
# Backend
pip install -r requirements.txt --upgrade

# Frontend
npm update
```

---

**Built with:** FastAPI, React, MongoDB, Groq AI, LangChain
