# Builds www/questions.js from the lamed-plus bank (official data.gov.il content, CC-BY).
import json, glob, os, shutil, sys
src = sys.argv[1]; out = sys.argv[2]
qs = []
for f in sorted(glob.glob(os.path.join(src, 'data/bank/*.json'))):
    qs += json.load(open(f, encoding='utf-8'))
expl = json.load(open(os.path.join(src, 'data/explanations.json'), encoding='utf-8'))['questions']
res = []
os.makedirs(os.path.join(out, 'img'), exist_ok=True)
for q in qs:
    if 'B' not in q['categories'] or 'he' not in q['translations']: continue
    he = q['translations']['he']
    if len(he['correctIndexes']) != 1 or len(he['options']) < 2: continue
    item = {'id': q['number'], 't': q['topicId'], 'q': he['stem'].strip(),
            'o': [o.strip() for o in he['options']], 'c': he['correctIndexes'][0]}
    if q.get('image'):
        name = os.path.basename(q['image'])
        s = os.path.join(src, 'public', q['image'])
        if os.path.exists(s):
            shutil.copy(s, os.path.join(out, 'img', name)); item['img'] = name
    e = expl.get(q['id'], {}).get('he')
    if e: item['e'] = e
    res.append(item)
res.sort(key=lambda x: x['id'])
with open(os.path.join(out, 'questions.js'), 'w', encoding='utf-8') as f:
    f.write('// מקור: משרד התחבורה והבטיחות בדרכים, data.gov.il (CC-BY). עיבוד: LAMED+ (MIT)\n')
    f.write('window.QUESTIONS=' + json.dumps(res, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(res), 'questions;', sum('img' in r for r in res), 'with images;', sum('e' in r for r in res), 'with explanations')
