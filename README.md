# AI-Powered Transcript-to-MCQ Generation System

## Overview

The AI-Powered Transcript-to-MCQ Generation System is a backend service that automatically generates high-quality multiple-choice questions (MCQs) from textual transcripts such as lectures, meetings, or training sessions.

Transcripts often contain conversational noise, filler words, redundancy, and weak structure. Large language models can also produce ambiguous or structurally invalid questions if not carefully constrained.

This system addresses these challenges using strict preprocessing, controlled chunk-based prompting, multi-stage validation, quality scoring, and optional AI-based blind validation. The result is a reliable, production-ready MCQ generation pipeline.

---

## Key Features

- Transcript preprocessing with noise removal and statistics
- Chunk-based LLM-driven question generation
- Keyword-driven subtopic extraction
- Parallel AI-based subtopic classification
- Support for single-correct, multiple-correct, and mixed question modes
- Multi-stage quality scoring and redundancy control
- Controlled regeneration with retry and API call limits
- AI-based blind validation (model-as-test-taker)
- MongoDB-backed persistent question bank

---

## System Architecture

The system is divided into four logical layers.

### User / UI Layer

- Uploads transcript files
- Triggers question generation and validation
- Fetches and edits generated question sets

### Backend Layer (FastAPI)

- Handles file ingestion and preprocessing
- Orchestrates generation, validation, and regeneration pipelines
- Exposes REST APIs
- Coordinates AI services and database interactions

### AI / LLM Layer

- Groq-hosted LLMs for:
  - Subtopic extraction
  - Question generation
  - Subtopic classification
  - Blind validation
- LangChain for deterministic chunking
- LangSmith for tracing and observability

### Database Layer

- MongoDB for persistent storage
- Stores transcripts, question sets, and validation metadata
- Supports consolidated and versioned question sets

---

## End-to-End Workflow

1. A user uploads a transcript file in TXT or DOCX format.
2. The system preprocesses the transcript by removing noise and computing statistics.
3. The cleaned transcript and metadata are stored in MongoDB.
4. The transcript is split into overlapping chunks to preserve context.
5. Keywords are extracted from all chunks and aggregated globally.
6. An LLM generates high-level subtopics from the keywords.
7. MCQs are generated per chunk using constrained prompts.
8. Invalid or low-quality questions are rejected.
9. Remaining questions are pooled and scored.
10. Regeneration is triggered if the target count is not met.
11. Final questions are selected and revalidated.
12. The consolidated question set is stored and exposed via API.

---

## Input

### Accepted File Formats

- TXT
- DOCX

### Generation Parameters

- question_type
  - single
  - multiple
  - mixed
- difficulty
  - easy
  - medium
  - hard
- num_questions
- num_options
- single_correct_percentage (used only in mixed mode)

---

## Question Generation Logic

- Transcripts are processed chunk-by-chunk for contextual relevance
- Single-correct and multiple-correct questions use different prompt constraints
- Multiple-correct questions require two to four correct options
- Extra questions are generated to offset rejection rates
- Invalid or ambiguous questions are aggressively filtered

---

## Validation and Quality Control

Validation is applied at multiple levels.

Structural validation:
- Required fields present
- Correct option counts
- Valid option indices

Option quality checks:
- Duplicate options
- Trivial distractors

Semantic validation:
- Difficulty alignment
- Concept clarity
- Subtopic consistency

Redundancy detection:
- Fuzzy matching across questions

Quality scoring factors:
- Concept diversity
- Difficulty balance
- Option overlap
- Semantic redundancy

---

## AI-Based Blind Validation

Blind validation treats the AI as a test-taker.

- The model does not see correct answers
- It selects answers based only on the question
- Predictions are compared against ground truth

Metrics computed:
- Answer accuracy
- Confidence score
- Ambiguity detection
- Difficulty alignment
- Overall quality score

---

## API Endpoints

POST /api/preprocess  
Cleans transcript and returns preprocessing statistics.

POST /api/generate-questions  
Generates MCQs and returns questions, subtopics, and metadata.

GET /api/question-sets  
Fetches all consolidated question sets.

GET /api/question-sets/{transcript_id}  
Fetches a specific question set.

POST /api/ai-validate  
Triggers AI-based blind validation.

PUT /api/question-sets/{question_set_id}  
Updates a question set.

---

## Database Schema Overview

### Transcripts Collection

- Original transcript
- Cleaned transcript
- Preprocessing statistics
- Timestamps

### Question Sets Collection

- Consolidated question sets
- Subtopics
- Question metadata
- Validation results
- Versioning information

A consolidated question set represents the final curated output.

---

## Example Consolidated Question Set

```json
{
  "_id": {
    "$oid": "696674aadafa768109061ea7"
  },
  "transcript_id": {
    "$oid": "69667299dafa768109061e97"
  },
  "chunk_index": -1,
  "is_consolidated": true,
  "subtopics": [
    "Dopamine System",
    "Brain Focus",
    "Stanford School",
    "Body Movement",
    "Good Feelings",
    "World Impact"
  ],
  "questions": [
    {
      "id": 1,
      "question": "What is a primary factor that can contribute to an individual discovering their passion and becoming proficient in a selected skillset?",
      "options": [
        "A person's upbringing",
        "Dabbling in various activities",
        "Practicing a single skill for many years",
        "Having a supportive family"
      ],
      "correct_options": [1],
      "difficulty": "hard",
      "type": "single",
      "chunk_index": 1,
      "subtopic": "Brain Focus"
    }
  ],
  "validation_metadata": {
    "ai_blind_validation": {
      "accuracy": 0.92,
      "confidence": 0.87,
      "ambiguity_flag": false,
      "difficulty_alignment": "matched"
    }
  },
  "created_at": "2026-01-18T14:30:00Z",
  "updated_at": "2026-01-18T14:32:10Z"
}
```
## Environment Setup

### Requirements

- Python 3.9 or higher
- MongoDB
- Groq API access

### Environment Variables

Set the following variables in a `.env` file:

- GROQ_API_KEY
- LANGCHAIN_TRACING_V2
- LANGCHAIN_ENDPOINT
- LANGCHAIN_PROJECT
- MONGODB_URI


---

## Running the Application

1. Create and activate a Python virtual environment.
2. Install project dependencies.
3. Configure environment variables in the `.env` file.
4. Start the FastAPI server using a development or production runner.

---

## Configuration and Customization

The system exposes multiple configuration parameters to balance quality, performance, and cost.

Configurable options include:

- Chunk size and chunk overlap
- Question regeneration multipliers
- Difficulty weighting factors
- Parallel worker count
- Retry limits for generation and validation
- Maximum regeneration attempts

These parameters allow fine-grained tuning depending on transcript size and cost constraints.

---

## Error Handling and Safeguards

The system includes multiple safety mechanisms:

- Graceful handling of malformed or empty transcripts
- Strict JSON parsing and schema validation for all AI outputs
- Retry logic with exponential backoff
- Safe fallbacks when AI responses fail or are invalid
- Hard caps on regeneration attempts to prevent runaway costs

---

## Performance and Scalability

- Chunk-based transcript processing enables horizontal scaling
- Parallel AI calls improve throughput for large transcripts
- Stateless FastAPI endpoints support load balancing
- Cost-aware regeneration and validation minimize unnecessary LLM usage

---

## Limitations

- LLMs may hallucinate in highly specialized or niche domains
- Output quality depends heavily on transcript clarity
- Multiple-correct questions have higher rejection rates
- Cost scales with transcript length and regeneration retries


