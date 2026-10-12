"""PC 위키(League of Legends Wiki)의 공식 스킬 미리보기 영상을 찾아 내려받고 분석한다.

사용법:
  PYTHONPATH=<opencv/numpy 경로> python3 tools/motion/fetch_wiki_videos.py <영상 저장 폴더> [docs/motion]
동작:
  1) MediaWiki API(list=categorymembers)로 'Category:<챔피언>_ability_videos'의 파일 목록을 조회해 스킬별 파일명을 확정
     (규칙: <챔피언>_<Q|W|E|R|I>Video.webm/ogv, 일부는 '<챔피언> Q Video.webm').
  2) prop=imageinfo로 실제 미디어 URL·크기·MIME·업로드 시각을 받아 내려받는다.
  3) video_events.py로 이벤트를 추출해 docs/motion/video_events_<champ>_<slot>.json에 저장하고,
     video_sources.json의 상태(mediaStatus/failureReason/metadata)를 갱신한다.
접근이 막히면 우회하지 않고 실패 사유만 기록한다.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

API = 'https://wiki.leagueoflegends.com/en-us/api.php'
NAMES = {'garen': 'Garen', 'darius': 'Darius', 'masteryi': 'Master Yi', 'leesin': 'Lee Sin', 'nautilus': 'Nautilus', 'yasuo': 'Yasuo',
         'yone': 'Yone', 'sett': 'Sett', 'mordekaiser': 'Mordekaiser', 'renekton': 'Renekton', 'nilah': 'Nilah', 'chogath': "Cho'Gath",
         'ezreal': 'Ezreal', 'ashe': 'Ashe', 'varus': 'Varus', 'ahri': 'Ahri', 'vex': 'Vex'}
UA = {'User-Agent': 'lol-motion-compare/1.0 (research; contact via repository)'}


def api(params):
    url = API + '?' + urllib.parse.urlencode({**params, 'format': 'json'})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return json.load(r)


def category_files(champ_name):
    data = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': f'Category:{champ_name} ability videos', 'cmtype': 'file', 'cmlimit': 50})
    return [m['title'] for m in data.get('query', {}).get('categorymembers', [])]


def pick(files, champ_name, slot):
    pat = re.compile(r'^File:' + re.escape(champ_name) + r'[ _]?' + slot + r'[ _]?Video(?: \d+)?\.(webm|ogv|mp4)$', re.I)
    cands = [f for f in files if pat.match(f) and 'old' not in f.lower()]
    cands.sort(key=lambda f: (0 if f.lower().endswith('.webm') else 1, f))
    return cands[0] if cands else None


def imageinfo(title):
    data = api({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|size|mime|timestamp'})
    page = next(iter(data['query']['pages'].values()))
    return (page.get('imageinfo') or [None])[0]


def main():
    out_dir = sys.argv[1]
    docs = sys.argv[2] if len(sys.argv) > 2 else 'docs/motion'
    os.makedirs(out_dir, exist_ok=True)
    src_path = os.path.join(docs, 'video_sources.json')
    sources = json.load(open(src_path, encoding='utf-8'))
    sys.path.insert(0, os.path.dirname(__file__))
    import video_events
    for cid, name in NAMES.items():
        try:
            files = category_files(name)
        except Exception as e:  # 네트워크 차단 등 - 우회하지 않고 기록만
            for s in 'QWER':
                sources[cid][s]['mediaStatus'] = 'not-downloaded'
                sources[cid][s]['failureReason'] = f'위키 API 접근 실패: {type(e).__name__}: {e}'
            print(cid, 'API 실패:', e)
            continue
        for s in 'QWER':
            entry = sources[cid][s]
            title = pick(files, name, s)
            if not title:
                entry.update({'mediaStatus': 'not-found', 'failureReason': '카테고리에 해당 스킬 영상 파일 없음'})
                continue
            try:
                info = imageinfo(title)
                ext = os.path.splitext(info['url'])[1]
                path = os.path.join(out_dir, f'{cid}_{s}{ext}')
                urllib.request.urlretrieve(info['url'], path)
                res = video_events.analyze(path)
                res.pop('series', None)
                res.update({'sourceTitle': title, 'sourceUrl': info['url'], 'uploadedAt': info.get('timestamp'), 'mime': info.get('mime')})
                json.dump(res, open(os.path.join(docs, f'video_events_{cid}_{s}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
                entry.update({'url': 'https://wiki.leagueoflegends.com/en-us/' + title.replace(' ', '_'), 'urlStatus': 'verified-by-api', 'mediaStatus': 'downloaded+analyzed',
                              'metadata': f"{info.get('mime')} {info.get('width')}x{info.get('height')} {info.get('size')}B, 업로드 {info.get('timestamp')}", 'failureReason': '',
                              'patch': '업로드 시점 기준(현재 패치와 다를 수 있음)', 'segment': f"전체 0~{res['durationSec']}s"})
                print(cid, s, 'ok', title)
            except Exception as e:
                entry.update({'mediaStatus': 'failed', 'failureReason': f'{type(e).__name__}: {e}'})
                print(cid, s, '실패:', e)
    json.dump(sources, open(src_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
