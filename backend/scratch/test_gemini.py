import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
# The error reported gemini-2.5-flash, but let's check what's configured
MODEL = "gemini-2.5-flash" # I'll test 2.0 first as 2.5 might be a typo or experimental

async def test_gemini():
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [{"text": "Say 'API is working' if you can read this."}]
        }]
    }
    
    print(f"Testing Gemini API...")
    print(f"Model: {MODEL}")
    print(f"URL: {url.split('key=')[0]}key=HIDDEN")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            
            if response.status_code == 200:
                print("SUCCESS! API is responding.")
                print("Response:", response.json()['candidates'][0]['content']['parts'][0]['text'])
            else:
                print(f"FAILED! Status Code: {response.status_code}")
                print("Error Details:", response.text)
                
                # If 503, it's definitely a server issue
                if response.status_code == 503:
                    print("\nNOTE: 503 means 'Service Unavailable'. Google's servers are likely overloaded or down for maintenance.")
                    
    except Exception as e:
        print(f"Error during request: {e}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
