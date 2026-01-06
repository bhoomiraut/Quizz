# 📊 Viewing Generated Questions in MongoDB Compass

## Quick Start

After generating questions, you'll see them in MongoDB Compass under the `question_sets` collection.

## Connection Details

- **Database:** `quizpriv_db` (or the name in your `.env` file)
- **Collections:**
  - `transcripts` - Stores uploaded transcript files
  - `question_sets` - Stores generated questions

## Finding Your Questions

### Option 1: View ALL Questions (Easiest)
1. Open MongoDB Compass
2. Connect to `mongodb://localhost:27017`
3. Navigate to database: `quizpriv_db`
4. Click on collection: `question_sets`
5. You'll see all question sets

### Option 2: Filter by Transcript ID
If you want questions from a specific upload:

1. In the `question_sets` collection
2. Use this filter (replace the ID with your transcript ID):
```json
{
  "transcript_id": ObjectId("YOUR_TRANSCRIPT_ID_HERE")
}
```

### Option 3: View Consolidated Questions Only
To see only the final consolidated question sets:

1. In the `question_sets` collection
2. Use this filter:
```json
{
  "is_consolidated": true
}
```

This will show you complete question sets (not per-chunk).

## Understanding the Data Structure

Each document in `question_sets` contains:

### Per-Chunk Documents:
```json
{
  "_id": ObjectId("..."),
  "transcript_id": ObjectId("..."),
  "chunk_index": 0,  // 0, 1, 2, etc.
  "chunk_size": 6000,
  "questions": [
    {
      "id": 1,
      "question": "Why would a developer...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_options": [0],
      "explanation": "This is correct because...",
      "marks": 1,
      "difficulty": "medium",
      "type": "single"
    }
  ],
  "num_questions": 3,
  "created_at": ISODate("2026-01-06T...")
}
```

### Consolidated Document:
```json
{
  "_id": ObjectId("..."),
  "transcript_id": ObjectId("..."),
  "chunk_index": -1,  // Special marker
  "is_consolidated": true,  // This is the final set
  "questions": [
    // ALL questions from all chunks combined
  ],
  "num_questions": 37,
  "total_chunks_processed": 13,
  "difficulty": "medium",
  "question_type": "multiple",
  "num_options": 4,
  "created_at": ISODate("2026-01-06T...")
}
```

## Terminal Output

After generating questions, the terminal will show:

```
✅ Consolidated questions saved to MongoDB
   Collection: question_sets
   Document ID: 695a8ab52bed28db039be095
   Total Questions: 37

📍 VIEW IN MONGODB COMPASS:
   Database: quizpriv_db
   Collection: question_sets
   Filter: { "transcript_id": ObjectId("695a8ab52bed28db039be095") }
   Or filter: { "is_consolidated": true }
```

Copy the filter directly into MongoDB Compass!

## Troubleshooting

### "I don't see any questions!"

1. **Check the correct collection:**
   - Questions are in `question_sets`, NOT `questions`
   
2. **Verify MongoDB is running:**
   ```bash
   # Check if MongoDB is running
   mongosh
   ```

3. **Check terminal output:**
   - Look for: `✅ Saved to MongoDB (collection: question_sets, doc_id: ...)`
   - If you see errors, questions might not have been saved

4. **Check the database name:**
   - Default is `quizpriv_db`
   - Check your `.env` file for `MONGO_DB_NAME`

### "I see chunks but want all questions together"

Use the consolidated filter:
```json
{ "is_consolidated": true }
```

This shows only the final combined question sets.

## Exporting Questions

To export questions from MongoDB Compass:

1. Select the `question_sets` collection
2. Click "Export Collection"
3. Choose JSON or CSV format
4. The questions array will be exported

---

## Quick Reference

| What You Want | Filter to Use |
|--------------|---------------|
| All questions | (no filter) |
| Questions from specific upload | `{"transcript_id": ObjectId("ID")}` |
| Only final question sets | `{"is_consolidated": true}` |
| Questions from chunk 0 | `{"chunk_index": 0}` |
| Medium difficulty questions | `{"difficulty": "medium"}` |
| Multiple choice questions | `{"question_type": "multiple"}` |

---

**Need Help?** Check the terminal output after generating questions - it will show you exactly what filters to use!
