
import os
import json
from collections import defaultdict

def extract_pyq_inventory(base_path):
    inventory = defaultdict(lambda: defaultdict(set))
    
    for root, dirs, files in os.walk(base_path):
        for file in files:
            if file.endswith('.json'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        questions = data if isinstance(data, list) else data.get('questions', [])
                        
                        for q in questions:
                            subject = q.get('subject', 'General')
                            topic = q.get('topic', 'General')
                            subtopic = q.get('subtopic')
                            
                            if subtopic:
                                inventory[subject][topic].add(subtopic)
                except Exception as e:
                    print(f"Error reading {file}: {e}")
                    
    return inventory

if __name__ == "__main__":
    path = r"c:\Users\Asus tuf\OneDrive\Desktop\New folder\online_assessment 2\online_assessment\backend\data\Examination Content"
    inv = extract_pyq_inventory(path)
    
    for subj, topics in sorted(inv.items()):
        print(f"\n# SUBJECT: {subj}")
        for topic, subs in sorted(topics.items()):
            print(f"  ## TOPIC: {topic}")
            for sub in sorted(list(subs)):
                print(f"    - {sub}")
