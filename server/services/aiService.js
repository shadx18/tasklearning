const OpenAI = require('openai');

let client = null;
let ollamaAvailable = null;

async function checkOllama() {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const res = await fetch((process.env.AI_BASE_URL || 'http://localhost:11434/v1') + '/models', {
      signal: AbortSignal.timeout(3000)
    });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  console.log('[AI] Ollama disponible:', ollamaAvailable);
  return ollamaAvailable;
}

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
  const model = process.env.AI_MODEL || 'llama3.2:3b';
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
  try { return JSON.parse(match[1] || match[0]); } catch { return null; }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanLine(l) {
  return l.replace(/[\u2022\u2023\u25E6\-\*]+/g, '').replace(/^\s+|\s+$/g, '');
}

function normalizePdfText(raw) {
  let text = raw.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/ {2,}/g, ' ');
  const lines = text.split('\n');
  const merged = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) { merged.push(''); continue; }

    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next) break;

      if (next.match(/^\d+\.\s/) || next.match(/^Unidad\s+/i) || next.match(/^Actividades\s/) ||
          next.match(/^Horas?\s/) || next.match(/^Objetivo\s/) || next.match(/^Producto\s/) ||
          next.match(/^Temas?\s/) || next.match(/^Lecci[oó]n/) || next.match(/^Contenido/) ||
          next.match(/^Secci[oó]n/) || next.match(/^\d+\.\d+/) ||
          next.match(/^[A-Z\u00C0-\u017F][A-Z\s]{4,}/)) {
        break;
      }

      const lastChar = line.slice(-1);
      const nextFirst = next.charAt(0);
      const isContinuation = nextFirst && nextFirst === nextFirst.toLowerCase() && !nextFirst.match(/\d/);
      const notEnding = lastChar && !'.:?!-'.includes(lastChar);

      if (notEnding && isContinuation) {
        line = line + ' ' + next;
        i++;
      } else {
        break;
      }
    }
    merged.push(line);
  }
  return merged.join('\n');
}

function detectDocType(fullText) {
  const lower = fullText.toLowerCase();
  if (lower.includes('plan tem') || lower.match(/unidad\s+(i{1,3}|iv|v)/)) return 'plan_tematico';
  if (lower.includes('syllabus') || lower.includes('programa de la asignatura')) return 'plan_tematico';
  return 'generico';
}

function generateQuestionsFromTopic(topicName, unitContext, activities) {
  const sentences = unitContext.split(/[\.!\?\n]+/).map(s => s.trim()).filter(s => s.length > 20);
  const questions = [];

  const conceptSentences = sentences.filter(s =>
    s.toLowerCase().includes('es ') || s.toLowerCase().includes('son ') ||
    s.toLowerCase().includes('permite') || s.toLowerCase().includes('consiste') ||
    s.toLowerCase().includes('represent') || s.toLowerCase().includes('se usa') ||
    s.toLowerCase().includes('incluye') || s.toLowerCase().includes('concepto')
  );

  if (conceptSentences.length >= 2) {
    const correct = conceptSentences[0].substring(0, 130);
    const distractors = [
      conceptSentences[1] ? conceptSentences[1].substring(0, 130) : 'No tiene relacion directa con el tema',
      'Es una definicion opuesta al contexto',
      'Solo aplica en un contexto diferente'
    ];
    questions.push({
      type: 'multiple_choice',
      question_text: 'Segun el contenido de "' + topicName.substring(0, 60) + '", cual es la描述ion mas adecuada?',
      options: shuffleArray([correct, ...distractors]),
      correct_answer: correct,
      explanation: 'Extraido del plan tematico de la asignatura.'
    });
  }

  if (sentences.length > 0) {
    const vs = sentences[0];
    questions.push({
      type: 'true_false',
      question_text: 'Verdadero o falso: ' + vs.substring(0, 140),
      options: ['Verdadero', 'Falso'],
      correct_answer: 'Verdadero',
      explanation: 'Basado en el texto del documento.'
    });
  }

  const hoursMatch = unitContext.match(/(\d+)\s*hora/i);
  if (hoursMatch) {
    questions.push({
      type: 'multiple_choice',
      question_text: 'Cuantas horas se destinan a esta seccion de la asignatura?',
      options: shuffleArray([hoursMatch[1] + ' horas', '4 horas', '8 horas', '20 horas']),
      correct_answer: hoursMatch[1] + ' horas',
      explanation: 'Segun la distribucion horaria del plan.'
    });
  }

  if (activities.length > 0) {
    questions.push({
      type: 'multiple_choice',
      question_text: 'Cual de las siguientes es una actividad practica recomendada?',
      options: shuffleArray([activities[0].substring(0, 120), activities[1] ? activities[1].substring(0, 120) : 'No se especifica', 'Estudio teorico exclusivo', 'No hay actividades prácticas']),
      correct_answer: activities[0].substring(0, 120),
      explanation: 'Actividad listada en el plan tematico.'
    });
  }

  if (sentences.length > 2) {
    const keywords = ['diferencia', 'comparar', 'distingu', 'clasif'];
    const compSentence = sentences.find(s => keywords.some(k => s.toLowerCase().includes(k)));
    if (compSentence) {
      questions.push({
        type: 'multiple_choice',
        question_text: 'Cual es un aspecto clave que se debe distinguir o comparar en este tema?',
        options: shuffleArray([compSentence.substring(0, 120), 'No se establece comparacion', 'Solo se aplica a un ambito', 'No aplica']),
        correct_answer: compSentence.substring(0, 120),
        explanation: 'Aspecto identificado en el contenido.'
      });
    }
  }

  return questions.slice(0, 5);
}

function generateFlashcardsFromTopic(topicName, unitContext) {
  const sentences = unitContext.split(/[\.!\?\n]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 250);
  const cards = [];

  for (let i = 0; i < Math.min(5, sentences.length); i++) {
    const s = sentences[i];
    const words = s.split(' ');
    const front = words.slice(0, Math.min(8, words.length)).join(' ') + (words.length > 8 ? '...' : '');
    cards.push({
      front: front,
      back: s.charAt(0).toUpperCase() + s.slice(1),
      difficulty: Math.min(3, i + 1)
    });
  }

  if (cards.length < 3) {
    const extraCards = [
      { front: 'Que es ' + topicName + '?', back: topicName + ' es un tema de la asignatura que estudia conceptos y tecnicas fundamentales para el procesamiento de informacion imprecisa o incierta.', difficulty: 1 },
      { front: 'Cual es el proposito de ' + topicName + '?', back: 'Permitir la representacion y procesamiento de conocimiento en contextos donde la informacion no es completamente precisa.', difficulty: 2 },
      { front: 'Donde se aplica ' + topicName + '?', back: 'En sistemas de inteligencia artificial, control difuso, diagnostico medico, toma de decisiones y analisis de datos con incertidumbre.', difficulty: 2 }
    ];
    for (const c of extraCards) {
      if (cards.length >= 5) break;
      cards.push(c);
    }
  }

  return cards;
}

function generateExercisesFromTopic(topicName, unitContext, activities) {
  const exercises = [];

  if (activities.length > 0) {
    exercises.push({
      statement: 'Actividad practica del plan: ' + activities[0] + '\nAplica los conceptos de "' + topicName + '" paso a paso.',
      solution: 'Paso 1: Identificar los conceptos clave del tema en el plan.\nPaso 2: Revisar las definiciones y propiedades del contenido.\nPaso 3: Aplicar la tecnica o metodo indicado al problema.\nPaso 4: Documentar supuestos, resultados y conclusiones.',
      type: 'practical'
    });
  }

  if (activities.length > 1) {
    exercises.push({
      statement: 'Desarrolla: ' + activities[1] + '\nUtiliza los conocimientos de "' + topicName + '".',
      solution: 'Paso 1: Revisar la teoria del tema antes de comenzar.\nPaso 2: Definir las variables y parametros del problema.\nPaso 3: Implementar paso a paso la solucion.\nPaso 4: Verificar resultados con casos de prueba.',
      type: 'practical'
    });
  }

  exercises.push({
    statement: 'Elabora un mapa conceptual que relacione los conceptos principales de "' + topicName + '" con al menos 5 conexiones logicas.',
    solution: 'Identifica el concepto central, luego ramifica los subtemas. Conecta cada concepto con flechas que indiquen relaciones de dependencia, composicion o causalidad. Incluye definiciones breves en cada nodo.',
    type: 'conceptual'
  });

  exercises.push({
    statement: 'Resume en 10 oraciones maximas los puntos mas importantes de "' + topicName + '" y justifica por que son fundamentales.',
    solution: 'Selecciona las ideas centrales del contenido. Para cada punto, escribe que es y por que importa. Asegurate de cubrir: definicion, proposito, metodo o tecnica, y aplicacion principal.',
    type: 'analytical'
  });

  return exercises;
}

function generateReviewFromTopic(topicName, unitContext, activities) {
  const sentences = unitContext.split(/[\.!\?\n]+/).map(s => s.trim()).filter(s => s.length > 15);
  
  const points = sentences.slice(0, 6).map((s, i) => {
    const clean = s.charAt(0).toUpperCase() + s.slice(1);
    return (i + 1) + '. ' + clean;
  });

  let tips = 'Metodo de estudio para este tema:\n';
  tips += '- Lee el contenido una vez sin notas\n';
  tips += '- Intenta explicar el tema de memoria\n';
  tips += '- Compara tu explicacion con el original\n';
  tips += '- Haz ejercicios de autoevaluacion\n';
  tips += '- Revisa conexiones con otros temas de la unidad';

  if (activities.length > 0) {
    tips += '\n\nActividad recomendada: ' + activities[0];
  }

  return {
    content: 'Resumen de aprendizaje: ' + topicName + '\n\n' + points.join('\n'),
    study_tips: tips
  };
}

function parsePlanTematico(fullText) {
  fullText = normalizePdfText(fullText);
  console.log('[Local] Analizando PLAN TEMATICO (normalizado)');

  const result = { units: [] };
  const nameMatch = fullText.match(/Asignatura:\s*(.+)/i);
  const subjectName = nameMatch ? nameMatch[1].trim() : 'Asignatura';

  const objGenMatch = fullText.match(/Objetivo general\s+([\s\S]*?)(?=Resultados de aprendizaje|3\.\s|Metodolog)/i);
  const objetivoGeneral = objGenMatch ? objGenMatch[1].trim() : '';

  /* --- Funciones auxiliares de generacion de contenido --- */

  function generateEducationalSummary(topicName, content, unitObjective, activities) {
    if (!content || content.length < 10) return topicName + ' es un tema del plan de estudios.';
    
    const sentences = content.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 12);
    
    let summary = 'En este tema se estudia: ';
    
    if (sentences.length > 0) {
      summary += sentences[0].charAt(0).toUpperCase() + sentences[0].slice(1);
      if (!summary.endsWith('.')) summary += '.';
    }
    
    if (sentences.length > 1) {
      summary += ' ' + sentences[1].charAt(0).toUpperCase() + sentences[1].slice(1);
      if (!summary.endsWith('.')) summary += '.';
    }
    
    if (unitObjective && unitObjective.length > 20) {
      summary += ' Este tema contribuye a: ' + unitObjective.substring(0, 150);
      if (!summary.endsWith('.')) summary += '.';
    }
    
    if (activities.length > 0) {
      summary += ' Actividad recomendada: ' + activities[0] + '.';
    }
    
    summary += ' Para aprender este tema, comienza por las definiciones基本icas, luego revisa los ejemplos y finalmente practica con ejercicios.';
    
    return summary.substring(0, 500);
  }

  function generateObjectives(topicName, content) {
    const objectives = [];
    objectives.push('Comprender los conceptos fundamentales de ' + topicName);
    
    if (content) {
      const lower = content.toLowerCase();
      if (lower.includes('aplicar') || lower.includes('implementar') || lower.includes('usar')) {
        objectives.push('Aplicar ' + topicName + ' en problemas practicos');
      }
      if (lower.includes('comparar') || lower.includes('diferencia') || lower.includes('contrastar')) {
        objectives.push('Comparar ' + topicName + ' con otros enfoques similares');
      }
      if (lower.includes('analizar') || lower.includes('evaluar') || lower.includes('critica')) {
        objectives.push('Analizar y evaluar el uso de ' + topicName);
      }
      if (lower.includes('diseñar') || lower.includes('crear') || lower.includes('desarrollar')) {
        objectives.push('Disenar soluciones usando ' + topicName);
      }
    }
    
    if (objectives.length < 3) {
      objectives.push('Identificar las aplicaciones de ' + topicName + ' en Ingenieria Informatica');
      objectives.push('Resolver ejercicios basicos de ' + topicName);
    }
    
    return objectives.slice(0, 4);
  }

  const unitPattern = /Unidad\s+(I{1,3}|IV|V|VI{0,3})\.\s+([^\n]+)/gi;
  let unitMatch;
  const unitPositions = [];
  const seenNums = new Set();

  while ((unitMatch = unitPattern.exec(fullText)) !== null) {
    const romanToNum = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    const num = romanToNum[unitMatch[1].toUpperCase()] || 0;
    if (num === 0 || seenNums.has(num)) continue;
    seenNums.add(num);
    unitPositions.push({ num, name: unitMatch[2].trim(), startPos: unitMatch.index });
  }

  console.log('[Local] Unidades:', unitPositions.length);

  if (unitPositions.length === 0) return parseGenerico(fullText, subjectName);

  for (let i = 0; i < unitPositions.length; i++) {
    const up = unitPositions[i];
    const endPos = (i + 1 < unitPositions.length) ? unitPositions[i + 1].startPos : fullText.length;
    const unitText = fullText.substring(up.startPos, endPos);

    const unit = { name: 'Unidad ' + up.num + ': ' + up.name, description: '', topics: [] };

    const hoursMatch = unitText.match(/Horas?\s*(?:sugeridas?)?\s*[:\s]*(\d+)/i);
    const hours = hoursMatch ? hoursMatch[1] : '';

    const objMatch = unitText.match(/Objetivo de la unidad\s+([\s\S]*?)(?=Temas y lecciones|Actividades|Laboratorio|$)/i);
    const unitObjective = objMatch ? objMatch[1].trim() : '';
    unit.description = (hours ? hours + ' horas. ' : '') + unitObjective.substring(0, 200);

    const lessons = [];
    const lessonBlockMatch = unitText.match(/Temas y lecciones\s+([\s\S]*?)(?=Actividades pr|Laboratorio|Unidad\s|$)/i);

    if (lessonBlockMatch) {
      const block = lessonBlockMatch[1];
      const lessonParts = block.split(/(?=\d+\.\s)/);

      for (const part of lessonParts) {
        const headerMatch = part.match(/^(\d+)\.\s+(.+?)(?:\n|$)/);
        if (!headerMatch) continue;
        let lessonName = headerMatch[2].trim();
        if (lessonName.length < 4 || lessonName.match(/^(Contenido|Horas?|Hora|Lecci|Tema|Nombre)/i)) continue;

        const restLines = part.substring(headerMatch[0].length).split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const filteredLines = restLines.filter(l => !l.match(/^Horas?$/i) && !l.match(/^\d+$/) && !l.match(/^Lecci/i) && !l.match(/^Contenido/i) && !l.match(/^Hora\s/i));

        if (lessonName.length < 30 && filteredLines.length > 0 && filteredLines[0].length > 3 && filteredLines[0].charAt(0) === filteredLines[0].charAt(0).toLowerCase()) {
          lessonName = lessonName + ' ' + filteredLines.shift();
        }

        const lessonContent = filteredLines.filter(l => l.length > 5 && !l.match(/^\d+$/)).join(' ').substring(0, 300);
        lessons.push({ name: lessonName, content: lessonContent || lessonName });
      }
    }

    if (lessons.length === 0) {
      const numberedItems = unitText.match(/(\d+)\.\s+(.+?)(?:\n|$)/g) || [];
      for (const item of numberedItems) {
        const m = item.match(/(\d+)\.\s+(.+)/);
        if (m && m[2].length > 5 && m[2].length < 150 && !m[2].match(/^(Contenido|Horas?|Hora|Lecci|Tema)/i)) {
          const contentIdx = fullText.indexOf(item.trim()) + item.length;
          const chunk = fullText.substring(contentIdx, contentIdx + 400);
          const cLines = chunk.split('\n').filter(l => l.trim().length > 10 && !l.match(/^\d+\.\s/) && !l.match(/^Hora/i));
          lessons.push({ name: m[2].trim(), content: cLines.slice(0, 2).join(' ').substring(0, 200) || m[2].trim() });
        }
      }
    }

    const activities = [];
    const actMatch = unitText.match(/Actividades pr[aá]cticas\s+([\s\S]*?)(?=Unidad\s|Laboratorio\s|Horas?\s*$|$)/i);
    if (actMatch) {
      const actLines = actMatch[1].split('\n').map(l => cleanLine(l)).filter(l => l.length > 10 && !l.match(/^(Actividades|Laboratorio|Unidad)/i));
      activities.push(...actLines.slice(0, 4));
    }

    console.log('  Unidad', up.num, ':', lessons.length, 'lecciones,', activities.length, 'actividades');

    for (const lesson of lessons) {
      const summary = generateEducationalSummary(lesson.name, lesson.content, unitObjective, activities);
      unit.topics.push({
        name: lesson.name,
        description: lesson.content.substring(0, 200) || 'Tema de la unidad',
        summary: summary,
        objectives: generateObjectives(lesson.name, lesson.content),
        concepts: [],
        questions: generateQuestionsFromTopic(lesson.name, lesson.content + '\n' + unitText, activities),
        flashcards: generateFlashcardsFromTopic(lesson.name, lesson.content),
        exercises: generateExercisesFromTopic(lesson.name, lesson.content, activities),
        reviews: [generateReviewFromTopic(lesson.name, lesson.content, activities)]
      });
    }

    result.units.push(unit);
  }

  result.summary = subjectName + ': ' + objetivoGeneral.substring(0, 200) + ' | ' + unitPositions.map(u => 'Unidad ' + u.num + ': ' + u.name).join(', ');
  return result;
}

function parseGenerico(fullText, docName) {
  fullText = normalizePdfText(fullText);
  console.log('[Local] Analisis generico');
  const lines = fullText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 3);
  const topics = [];
  const seen = new Set();

  const addTopic = (t) => {
    const clean = t.replace(/\s+/g, ' ').trim();
    if (clean.length < 8 || clean.length > 120) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    topics.push(clean);
  };

  const numPatterns = [
    /^(\d{1,2})\.\s+([A-Z\u00C0-\u017F].{5,100})/,
    /^(\d{1,2}\.\d{1,2})\.\s+(.{5,100})/,
  ];
  const structPatterns = [
    /^(tema|capitulo|unidad|modulo|seccion|parte|clase|practica|taller|laboratorio)\s+\d+[\.\:\-]?\s*(.+)/i,
  ];

  lines.forEach((line) => {
    for (const pat of numPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[1]); break; }
    }
    for (const pat of structPatterns) {
      const m = line.match(pat);
      if (m) { addTopic(m[2] || m[0]); break; }
    }
  });

  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 180);
    const kw = ['tema','concepto','definicion','importante','fundamental','aplicacion','ejemplo'];
    sentences.forEach(s => {
      if (topics.length >= 15) return;
      if (kw.some(k => s.toLowerCase().includes(k))) addTopic(s.split(':').pop().trim().substring(0, 90));
    });
  }

  if (topics.length < 4) {
    const sentences = fullText.split(/[\.!\?]+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 150);
    [...new Set(sentences)].slice(0, 10).forEach(s => addTopic(s));
  }

  const units = [];
  const topicsPerUnit = Math.max(1, Math.ceil(topics.length / 3));

  for (let u = 0; u < Math.ceil(topics.length / topicsPerUnit); u++) {
    const unitTopics = topics.slice(u * topicsPerUnit, (u + 1) * topicsPerUnit);
    if (unitTopics.length === 0) continue;

    const topicObjects = unitTopics.map(t => {
      const lower = fullText.toLowerCase();
      const idx = lower.indexOf(t.toLowerCase().substring(0, 25));
      const ctx = idx !== -1 ? fullText.substring(Math.max(0, idx - 200), Math.min(fullText.length, idx + 800)) : fullText.substring(0, 1000);
      return {
        name: t, description: 'Tema del documento',
        summary: ctx.split(/[\.!\n]+/).slice(0, 3).join('. ').substring(0, 300) || 'Contenido del tema',
        objectives: ['Comprender ' + t], concepts: [],
        questions: generateQuestionsFromTopic(t, ctx, []),
        flashcards: generateFlashcardsFromTopic(t, ctx),
        exercises: generateExercisesFromTopic(t, ctx, []),
        reviews: [generateReviewFromTopic(t, ctx, [])]
      };
    });

    units.push({ name: 'Unidad ' + (u + 1), description: unitTopics.length + ' tema(s)', topics: topicObjects });
  }

  if (units.length === 0) {
    units.push({
      name: 'Contenido General', description: 'Automatico',
      topics: [{
        name: docName, description: 'Documento', summary: fullText.substring(0, 300),
        objectives: ['Comprender ' + docName], concepts: [],
        questions: generateQuestionsFromTopic(docName, fullText.substring(0, 1000), []),
        flashcards: generateFlashcardsFromTopic(docName, fullText.substring(0, 1000)),
        exercises: generateExercisesFromTopic(docName, fullText.substring(0, 1000), []),
        reviews: [generateReviewFromTopic(docName, fullText.substring(0, 1000), [])]
      }]
    });
  }

  return { units, summary: docName + ': ' + topics.slice(0, 5).join(', ') };
}

function analyzeLocally(fullText, docName) {
  console.log('[Local] Analizando:', fullText.length, 'chars');
  const docType = detectDocType(fullText);
  console.log('[Local] Tipo:', docType);
  if (docType === 'plan_tematico') return parsePlanTematico(fullText);
  return parseGenerico(fullText, docName);
}

const ANALYSIS_SYSTEM_PROMPT = 'Eres un analista academico experto. Analiza el contenido educativo y extrae una estructura organizada.\nResponde UNICAMENTE con JSON valido (sin markdown) con esta estructura:\n{"units":[{"name":"Unidad","description":"Desc","topics":[{"name":"Tema","description":"Desc","summary":"Resumen","objectives":["obj"],"concepts":[{"name":"Concepto","definition":"Def"}],"questions":[{"type":"multiple_choice","question_text":"Pregunta?","options":["A","B","C","D"],"correct_answer":"A","explicacion":"Por que"}],"flashcards":[{"front":"Pregunta","back":"Respuesta","difficulty":1}],"exercises":[{"statement":"Enunciado","solution":"Solucion","type":"practical"}],"reviews":[{"content":"Repaso","study_tips":"Tips"}]}]}]}\nGenera al menos 3 preguntas, 3 flashcards, 1 ejercicio y 1 repaso por tema.';

async function analyzeWithAI(chunks, docName) {
  const MAX_CHARS = 12000;
  const batches = [];
  let current = '';
  for (const chunk of chunks) {
    const sep = current ? '\n\n' : '';
    if ((current + sep + chunk.content).length > MAX_CHARS && current) { batches.push(current); current = chunk.content; }
    else { current = current ? current + sep + chunk.content : chunk.content; }
  }
  if (current) batches.push(current);
  const allUnits = [];
  if (batches.length === 1) {
    const r = await callLLM(ANALYSIS_SYSTEM_PROMPT, 'Analiza "' + docName + '":\n\n' + batches[0], 8000);
    const p = parseJSON(r);
    if (p && p.units) return p;
  } else {
    for (let i = 0; i < batches.length; i++) {
      try {
        const r = await callLLM(ANALYSIS_SYSTEM_PROMPT, 'Parte ' + (i+1) + '/' + batches.length + ' de "' + docName + '":\n\n' + batches[i], 8000);
        const p = parseJSON(r);
        if (p && p.units) allUnits.push(...p.units);
      } catch (e) { console.error('[AI] Error tanda', i+1, e.message); }
    }
    if (allUnits.length > 0) return { units: allUnits };
  }
  throw new Error('No se pudo parsear respuesta IA');
}

async function analyzeDocument(chunks, docName) {
  const hasAI = await checkOllama();
  if (hasAI) {
    try { console.log('[AI] Usando Ollama...'); return await analyzeWithAI(chunks, docName); }
    catch (e) { console.warn('[AI] Ollama fallo, local:', e.message); }
  } else { console.log('[AI] Sin Ollama, analisis local v3'); }
  const fullText = chunks.map(c => c.content).join('\n\n');
  return analyzeLocally(fullText, docName);
}

async function answerQuestion(question, contextChunks, docName) {
  const hasAI = await checkOllama();
  const context = contextChunks.map((c, i) => '[Fuente ' + (i+1) + ': Pag ' + c.page_number + ']\n' + c.content).join('\n\n---\n\n');
  if (hasAI) {
    try {
      return await callLLM('Eres un tutor academico. Responde usando SOLO el contexto. Indica fuentes.', 'Materiales de "' + docName + '":\n' + context + '\nPregunta: ' + question, 2000);
    } catch (e) { console.warn('[AI] Tutor fallback:', e.message); }
  }
  return 'Respuesta basada en "' + docName + '":\n\n' + contextChunks.map((c, i) => '[Fuente ' + (i+1) + ', Pag ' + c.page_number + ']: ' + c.content.substring(0, 200)).join('\n\n') + '\n\n(Analisis local - para IA completa, instala Ollama)';
}

module.exports = { getClient, callLLM, analyzeDocument, answerQuestion, analyzeLocally };
