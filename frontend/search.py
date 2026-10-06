from duckduckgo_search import DDGS

query = 'steve harrington stranger things 4 poster'
print(f'Searching for: {query}')

with DDGS() as ddgs:
    results = [r for r in ddgs.images(query, max_results=10)]
    for i, res in enumerate(results):
        print(f"Result {i}: {res['image']}")
