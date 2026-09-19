const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.AI_BASE_URL || 'http://localhost:11434/v1',
      apiKey: process.env.AI_API_KEY || 'ollama'
    });
  }
  return client;
}

async function callLLM(systemPrompt, userPrompt, maxTokens = 4000) {
  const ai = getClient();
  const model = process.env.AI_MODEL || 'gemma4:26b';

  const response = await ai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.3
  });

  return response.choices[0].message.content;
}

function parseJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[1] || match[0]);
  } catch {
    return null;
  }
}

const ANALYSIS_SYSTEM_PROMPT = [
  'Eres un analista academico experto. Analiza el contenido educativo y extrae una estructura organizada.',
  'Responde UNICAMENTE con JSON valido (sin markdown) con esta estructura:',
  '{"units":[{"name":"Unidad","description":"Desc","topics":[{"name":"Tema","description":"Desc","summary":"Resumen en 2-3 oraciones","objectives":["obj1"],"concepts":[{"name":"Concepto","definition":"Definicion"}],"questions":[{"type":"multiple_choice","question_text":"Pregunta?","options":["A","B","C","D"],"correct_answer":"A","explicacion":"Por que"}],"flashcards":[{"front":"Pregunta","back":"Respuesta","difficulty":1}],"exercises":[{"statement":"Enunciado","solution":"Solucion paso a paso","type":"practical"}],"reviews":[{"content":"Repaso","study_tips":"Consejos"}]}]}]}',
  'Genera al menos 3 preguntas por tema, 3 flashcards, 1 ejercicio y 1 repaso.',
  'Las preguntas deben ser variadas: multiple_choice, true_false.',
  'La dificultad de las flashcards va de 1 (basico) a 5 (avanzado).'
].join('\n');

function basicFallback(docName) {
  return {
    units: [{
      name: 'Contenido General',
      description: 'Unidad generada automaticamente',
      topics: [{
        name: docName,
        description: 'Tema principal del documento',
        summary: 'Contenido extraido del documento. Revisar manualmente.',
        objectives: ['Comprender el contenido del documento'],
        concepts: [],
        questions: [
          { type: 'multiple_choice', question_text: 'Cual es el tema principal del documento?', options: ['Tema A', 'Tema B', 'Tema C', 'No determinado'], correct_answer: 'Tema A', explicacion: 'Revisar el documento para identificar los temas principales.' },
          { type: 'true_false', question_text: 'El documento contiene material academico.', options: ['Verdadero', 'Falso'], correct_answer: 'Verdadero', explicacion: 'El documento fue subido como material de estudio.' },
          { type: 'multiple_choice', question_text: 'Que tipo de contenido presenta?', options: ['Plan tematico', 'Apuntes', 'Ejercicios', 'Todos los anteriores'], correct_answer: 'Todos los anteriores', explicacion: 'El tipo depende del contenido real del PDF.' }
        ],
        flashcards: [
          { front: 'Que es esta asignatura?', back: docName + ' - revisar documento para definicion exacta.', difficulty: 1 },
          { front: 'Cual es el objetivo principal?', back: 'Comprender y dominar el contenido del plan de estudios.', difficulty: 1 },
          { front: 'Como preparar el examen?', back: 'Revisar todos los temas, practicar ejercicios, repasar definiciones.', difficulty: 2 }
        ],
        exercises: [
          { statement: 'Releer el documento completo y elaborar un resumen de cada tema.', solution: 'Paso 1: Identificar los temas principales.\nPaso 2: Resumir cada tema en 3-5 oraciones.\nPaso 3: Relacionar conceptos entre si.\nPaso 4: Elaborar definiciones propias.', type: 'practical' }
        ],
        reviews: [
          { content: 'Repaso general del contenido del documento. Identificar conceptos clave, definiciones y relaciones entre temas.', study_tips: 'Crear mapa conceptual. Practicar con ejercicios. Repasar definiciones antes del examen.' }
        ]
      }]
    }]
  };
}

async function analyzeDocument(chunks, docName) {
  const MAX_CHARS_PER_BATCH = 12000;

  const batches = [];
  let currentBatch = '';
  for (const chunk of chunks) {
    const separator = currentBatch ? '\n\n' : '';
    if ((currentBatch + separator + chunk.content).length > MAX_CHARS_PER_BATCH && currentBatch) {
      batches.push(currentBatch);
      currentBatch = chunk.content;
    } else {
      currentBatch = currentBatch ? currentBatch + separator + chunk.content : chunk.content;
    }
  }
  if (currentBatch) batches.push(currentBatch);

  const allUnits = [];

  if (batches.length === 1) {
    const userPrompt = 'Analiza el siguiente contenido del documento "' + docName + '" y extrae la estructura academica:\n\n' + batches[0];
    try {
      const response = await callLLM(ANALYSIS_SYSTEM_PROMPT, userPrompt, 8000);
      const parsed = parseJSON(response);
      if (parsed && parsed.units) return parsed;
    } catch (e) {
      console.error('[AI] Error en analisis:', e.message);
    }
  } else {
    for (let i = 0; i < batches.length; i++) {
      const userPrompt = 'Analiza la parte ' + (i + 1) + ' de ' + batches.length + ' del documento "' + docName + '". Extrae unidades, temas y materiales:\n\n' + batches[i];
      try {
        const response = await callLLM(ANALYSIS_SYSTEM_PROMPT, userPrompt, 8000);
        const parsed = parseJSON(response);
        if (parsed && parsed.units) allUnits.push(...parsed.units);
      } catch (e) {
        console.error('[AI] Error en tanda ' + (i + 1) + ':', e.message);
      }
    }
    if (allUnits.length > 0) return { units: allUnits };
  }

  console.error('[AI] No se pudo parsear la respuesta, usando estructura basica');
  return basicFallback(docName);
}

async function answerQuestion(question, contextChunks, docName) {
  const context = contextChunks.map((c, i) => '[Fuente ' + (i + 1) + ': Pagina ' + c.page_number + ']\n' + c.content).join('\n\n---\n\n');

  const systemPrompt = 'Eres un tutor academico experto. Responde la pregunta del estudiante usando SOLAMENTE el contexto proporcionado de los materiales de estudio.\nSi el contexto no contiene suficiente informacion para responder completa y correctamente, di que no tienes suficiente informacion en los materiales.\nSiempre indica las fuentes que utilizaste.\nResponde en espanol, de forma clara y educativa.\nFormato: respuesta directa, luego "Fuentes:" con las referencias.';

  const userPrompt = 'Materiales de "' + docName + '":\n' + context + '\n\nPregunta del estudiante: ' + question;

  return await callLLM(systemPrompt, userPrompt, 2000);
}

module.exports = { getClient, callLLM, analyzeDocument, answerQuestion };
