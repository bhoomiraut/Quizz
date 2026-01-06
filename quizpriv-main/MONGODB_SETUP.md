# MongoDB Integration Guide

## ✅ What's Been Added

### 📁 New Files Created
1. **`server/app/db.py`** - MongoDB connection and collections setup
2. **Updated `.env`** - MongoDB configuration

### 🗄️ Database Structure

#### Collections Created:
1. **`transcripts`** - Stores uploaded transcript files
   ```javascript
   {
     _id: ObjectId,
     filename: String,
     content: String,
     original_length: Number,
     cleaned_length: Number,
     created_at: DateTime
   }
   ```

2. **`question_sets`** - Stores generated questions per chunk
   ```javascript
   {
     _id: ObjectId,
     transcript_id: ObjectId,  // Reference to transcript
     chunk_index: Number,
     chunk_size: Number,
     questions: Array,
     num_questions: Number,
     created_at: DateTime
   }
   ```

#### Indexes Created:
- `transcripts.created_at` (ascending)
- `question_sets.transcript_id` (ascending)
- `question_sets.transcript_id + chunk_index` (compound)

### 🎨 Enhanced Terminal Output

New visual output with emojis and progress tracking:

```
================================================================================
📝 TRANSCRIPT UPLOAD INITIATED
================================================================================
📄 Filename: meeting_transcript.docx
📊 Original Length: 45,234 characters
✂️  Cleaned Length: 43,567 characters
📉 Reduction: 3.68%
================================================================================

================================================================================
🔪 LANGCHAIN TEXT SPLITTING
================================================================================
📦 Text split into 8 chunks
⚙️  Chunk size: 6000 chars | Overlap: 350 chars
================================================================================

================================================================================
🚀 STARTING CHUNK-WISE QUESTION GENERATION
================================================================================

────────────────────────────────────────────────────────────────────────────────
📦 CHUNK 1/8
────────────────────────────────────────────────────────────────────────────────
📏 Size: 6,000 characters
🎯 Target: 12 questions
⏳ Calling Groq API (llama-3.3-70b-versatile)...
✅ API call successful
🔍 Parsing JSON response...
✅ JSON parsed - 12 questions extracted
🧠 Generating embeddings for 12 questions...
✅ Embeddings generated
💾 Saved to MongoDB
✅ SUCCESS - 12 questions added (Total: 12)

────────────────────────────────────────────────────────────────────────────────
📦 CHUNK 2/8
────────────────────────────────────────────────────────────────────────────────
...

================================================================================
🎉 GENERATION COMPLETE
================================================================================
📦 Total Chunks: 8
✅ Successfully Processed: 7
❌ Failed Chunks: 1
📝 Total Questions Generated: 84
💾 MongoDB Transcript ID: 507f1f77bcf86cd799439011
⚠️  Failed Chunk Indices: [3]
================================================================================
```

## 🚀 Setup Instructions

### 1. Install MongoDB (if not already installed)

**Windows:**
```powershell
# Download and install MongoDB Community Edition
# https://www.mongodb.com/try/download/community

# Or using Chocolatey:
choco install mongodb
```

**Start MongoDB:**
```powershell
# Start MongoDB service
net start MongoDB

# Or run mongod directly:
mongod --dbpath="C:\data\db"
```

### 2. Verify MongoDB is Running

```powershell
# Check if MongoDB is running on default port
Test-NetConnection -ComputerName localhost -Port 27017
```

### 3. Install MongoDB Compass (Optional but Recommended)

Download from: https://www.mongodb.com/try/download/compass

MongoDB Compass allows you to:
- View your databases and collections visually
- Browse transcript and question data
- Run queries
- Monitor performance

### 4. Configure Connection

The `.env` file is already configured with:
```env
MONGO_URI=mongodb://localhost:27017/
MONGO_DB_NAME=quizpriv_db
```

**For MongoDB Atlas (Cloud):**
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGO_DB_NAME=quizpriv_db
```

## 📊 Viewing Data in MongoDB Compass

1. **Open MongoDB Compass**
2. **Connect** using: `mongodb://localhost:27017`
3. **Select Database**: `quizpriv_db`
4. **View Collections**:
   - Click on `transcripts` to see uploaded files
   - Click on `question_sets` to see generated questions by chunk

### Sample Queries in Compass

**Find all transcripts:**
```javascript
{}
```

**Find questions for a specific transcript:**
```javascript
{ "transcript_id": ObjectId("your_transcript_id_here") }
```

**Find all questions sorted by chunk:**
```javascript
// Filter
{ "transcript_id": ObjectId("your_transcript_id_here") }

// Sort
{ "chunk_index": 1 }
```

## 🔧 MongoDB Features

### Automatic Handling
- ✅ Creates database and collections automatically on first use
- ✅ Creates indexes for optimized queries
- ✅ Graceful fallback if MongoDB is unavailable
- ✅ Continues processing even if MongoDB save fails

### Data Relationships
```
transcripts (1) ──┐
                  │ has many
                  ├──> question_sets (N)
                  └──> each linked by transcript_id
```

## 🧪 Testing MongoDB Integration

### 1. Generate Questions
Upload a transcript file through the frontend and watch the terminal for:
- MongoDB save confirmation
- Transcript ID display
- Per-chunk save status

### 2. Check MongoDB Compass
- Open MongoDB Compass
- Navigate to `quizpriv_db` database
- Check `transcripts` collection for the new document
- Check `question_sets` collection for the generated questions

### 3. Verify Response
The API response now includes:
```json
{
  "transcript_id": "507f1f77bcf86cd799439011",
  "mongodb_enabled": true,
  "langchain_enabled": true,
  ...
}
```

## ⚠️ Troubleshooting

### MongoDB Connection Failed
If you see warnings about MongoDB:
```
⚠️  MongoDB Warning: Failed to save transcript - ...
⚠️  Continuing without database storage...
```

**Solutions:**
1. Ensure MongoDB is running:
   ```powershell
   net start MongoDB
   ```

2. Check connection string in `.env`:
   ```env
   MONGO_URI=mongodb://localhost:27017/
   ```

3. Test connection:
   ```powershell
   mongo
   # or
   mongosh
   ```

### The app will continue to work even without MongoDB!
- Questions are still generated
- Questions are still returned in the API response
- Only the database storage is skipped

## 📈 Benefits

1. **Persistence** - All transcripts and questions are saved permanently
2. **History** - Track all uploads and generations
3. **Analytics** - Query historical data for insights
4. **Backup** - Easy to export/import data
5. **Scalability** - Ready for production use
6. **Traceability** - Link questions back to source transcript

## 🔄 API Response Updates

The `/api/generate-questions` endpoint now returns:

```json
{
  "questions": [...],
  "total_questions": 84,
  "transcript_id": "507f1f77bcf86cd799439011",
  "mongodb_enabled": true,
  "langchain_enabled": true,
  "total_chunks": 8,
  "processed_chunks": 7,
  "failed_chunks": [...],
  "preprocessing_stats": {...}
}
```

## 🎯 Next Steps

1. **Start MongoDB** if not running
2. **Upload a transcript** to test the integration
3. **Open MongoDB Compass** to view the saved data
4. **Monitor terminal output** for detailed chunk progress
5. **Query the database** to explore your data

---

**Note:** MongoDB is optional. If MongoDB is not available, the app will continue to function normally, just without data persistence.
