// Report Navi - Decision Set 생성용 서버 함수
// 브라우저에서 /api/analyze 로 POST 하면 이 코드가 Netlify 서버에서 실행됩니다.
// ANTHROPIC_API_KEY 는 Netlify 환경변수에만 존재하며 브라우저로 전달되지 않습니다.

const MODEL = 'claude-sonnet-5';
const MAX_SLIDES = 40;
const MAX_CHARS_PER_SLIDE = 1800;

const DECISION_TYPES = ['conclusion', 'evidence', 'assumption', 'risk', 'request'];

interface IncomingSlide {
  page?: unknown;
  title?: unknown;
  sourceText?: unknown;
}

function buildPrompt(objectiveType: string, objective: string, slides: IncomingSlide[]): string {
  const deck = slides
    .slice(0, MAX_SLIDES)
    .map((slide) => {
      const page = typeof slide.page === 'number' ? slide.page : 0;
      const title = typeof slide.title === 'string' ? slide.title : '';
      const text = typeof slide.sourceText === 'string' ? slide.sourceText.slice(0, MAX_CHARS_PER_SLIDE) : '';
      return `[슬라이드 ${page}] 제목: ${title}\n${text}`;
    })
    .join('\n\n');

  return `당신은 엔지니어링 회사의 보고 준비를 돕는 분석기입니다.

아래는 실무자가 발표할 보고자료의 전체 텍스트입니다.
이 보고의 목적은 "${objectiveType}" 이며, 구체적인 목표는 다음과 같습니다.
목표: ${objective}

이 목표를 상대방이 판단하려면 반드시 구두로 전달되어야 하는 정보를 5개 유형으로 추출하세요.

- conclusion(결론): 이 보고가 최종적으로 무엇을 제안·판단하는가
- evidence(근거): 그 판단을 뒷받침하는 수치·계산·비교 결과
- assumption(전제): 그 판단이 성립하기 위해 필요한 조건·가정
- risk(리스크): 이 선택을 할 때 상대방이 감수해야 하는 영향·제약
- request(요청): 상대방이 실제로 취해야 하는 결정·승인 행동

규칙:
1. 5개 유형이 모두 최소 1개씩 포함되어야 합니다. 전체 6~10개를 만드세요.
2. 자료에 실제로 있는 내용만 사용하세요. 없는 수치를 지어내지 마세요.
3. 수치가 있는 항목은 title에 반드시 그 수치를 단위와 함께 포함하세요.
4. slide 는 그 내용이 등장하는 슬라이드 번호입니다.
5. required 는 이 목표 달성에 반드시 필요하면 true, 있으면 좋은 정도면 false 입니다.
6. estimatedSeconds 는 그 항목을 말로 설명하는 데 걸리는 시간(10~25초)입니다.
7. variants 는 발표자가 그 항목을 실제로 말할 법한 서로 다른 한국어 문장 3~5개입니다.
   - 숫자는 아라비아 숫자와 한글 읽기를 모두 포함하세요. 예: "106.2kW", "106.2 킬로와트"
   - 단위 표기를 섞으세요. 예: "8%", "8퍼센트", "8프로"
   - 어순과 표현을 바꾼 문장을 포함하세요.

출력은 아래 형식의 JSON 배열 하나만 출력하세요.
설명, 인사말, 마크다운 코드펜스를 절대 붙이지 마세요.

[
  {
    "type": "conclusion",
    "title": "짧은 제목",
    "detail": "한 문장 설명",
    "slide": 3,
    "required": true,
    "estimatedSeconds": 16,
    "variants": ["...", "...", "..."]
  }
]

=== 보고자료 ===
${deck}`;
}

function parseItems(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('모델 응답에서 JSON 배열을 찾지 못했습니다.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeItems(parsed: unknown, slideCount: number) {
  if (!Array.isArray(parsed)) throw new Error('모델 응답이 배열이 아닙니다.');

  const items = parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .filter((entry) => DECISION_TYPES.includes(String(entry.type)))
    .filter((entry) => typeof entry.title === 'string' && entry.title.trim().length > 0)
    .map((entry, index) => {
      const title = String(entry.title).trim();
      const detail = typeof entry.detail === 'string' ? entry.detail.trim() : title;
      const slide = Math.min(Math.max(Number(entry.slide) || 1, 1), Math.max(slideCount, 1));
      const seconds = Math.min(Math.max(Number(entry.estimatedSeconds) || 14, 8), 40);
      const variants = Array.isArray(entry.variants)
        ? entry.variants.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      return {
        id: `ai-${entry.type}-${Date.now()}-${index}`,
        type: entry.type,
        title,
        detail,
        slide,
        required: entry.required !== false,
        estimatedSeconds: seconds,
        variants: variants.length ? variants : [title, detail],
        sourceText: detail,
        delivered: false,
      };
    });

  if (items.length < 3) throw new Error('추출된 항목이 너무 적습니다.');
  return items;
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST 요청만 허용됩니다.' }, { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: { objective?: string; objectiveType?: string; slides?: IncomingSlide[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 본문을 읽지 못했습니다.' }, { status: 400 });
  }

  const slides = Array.isArray(body.slides) ? body.slides : [];
  if (!slides.length) {
    return Response.json({ error: '분석할 슬라이드가 없습니다.' }, { status: 400 });
  }

  const objective = (body.objective || '보고 목적 달성').slice(0, 300);
  const objectiveType = (body.objectiveType || '보고').slice(0, 60);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: buildPrompt(objectiveType, objective, slides) }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Anthropic API error', response.status, detail.slice(0, 500));
      return Response.json({ error: `AI 분석 요청이 실패했습니다. (${response.status})` }, { status: 502 });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((block: { type?: string }) => block?.type === 'text')
      .map((block: { text?: string }) => block.text || '')
      .join('\n');

    const items = normalizeItems(parseItems(text), slides.length);
    return Response.json({ items });
  } catch (error) {
    console.error('analyze failed', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return Response.json({ error: `분석 결과를 처리하지 못했습니다: ${message}` }, { status: 502 });
  }
};

export const config = { path: '/api/analyze' };
