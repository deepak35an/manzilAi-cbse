import asyncio
import json
from unittest.mock import AsyncMock, patch
from app.services.evaluation_service import evaluate_answer

async def test_grading():
    question = {
        "question": "What is the capital of France?",
        "answer": "Paris",
        "type": "MCQ",
        "difficulty": 0.3
    }
    
    # Mock Gemma (Ollama) response
    mock_response = {
        "response": json.dumps({"score": 10.0, "explanation": "Correct answer"})
    }
    
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json = lambda: mock_response
        mock_post.return_value.raise_for_status = lambda: None
        
        # Test Standard Mode
        result_std = await evaluate_answer(question, "Paris", mode="standard")
        print("\nStandard Mode Result:")
        print(f"Score: {result_std['score']}")
        print(f"Explanation: '{result_std['explanation']}' (Should be empty)")
        
        # Test PYQ Mode
        mock_response_pyq = {
            "response": json.dumps({"score": -2.5, "explanation": "Incorrect MCQ"})
        }
        mock_post.return_value.json = lambda: mock_response_pyq
        result_pyq = await evaluate_answer(question, "London", mode="pyq")
        print("\nPYQ Mode Result (Incorrect MCQ):")
        print(f"Score: {result_pyq['score']}")
        print(f"Explanation: '{result_pyq['explanation']}' (Should be empty)")

if __name__ == "__main__":
    asyncio.run(test_grading())
