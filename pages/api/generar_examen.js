// pages/api/generar_examen.js
import { GoogleGenAI } from '@google/genai';
import formidable from 'formidable';
import fs from 'fs';

// Definición del JSON Schema para asegurar que la IA devuelva el formato correcto
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    examen: {
      type: 'object',
      properties: {
        preguntas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              pregunta: { type: 'string' },
              opciones: {
                type: 'object',
                properties: {
                  a: { type: 'string' },
                  b: { type: 'string' },
                  c: { type: 'string' },
                  d: { type: 'string' },
                },
                required: ['a', 'b', 'c', 'd'],
              },
              respuesta_correcta: { type: 'string', description: "La letra de la opción correcta (e.g., 'b')" },
            },
            required: ['id', 'pregunta', 'opciones', 'respuesta_correcta'],
          },
        },
      },
      required: ['preguntas'],
    },
  },
  required: ['examen'],
};

// Inicializa el cliente de Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Evita que Next.js interprete el cuerpo como JSON
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se permiten peticiones POST.' });
  }

  // 1. Manejo del Archivo Subido (Ahora espera múltiples archivos bajo el nombre 'files')
  const form = formidable({});
  
  const [fields, files] = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve([fields, files]);
    });
  });

  // CAMBIO CLAVE 1: Asegurar que files.files es un array
  const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];
  const examType = fields.exam_type?.[0] || '5 preguntas de opción múltiple';

  if (uploadedFiles.length === 0 || !uploadedFiles[0]) {
    return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
  }

  try {
    const prompt = [];
    
    // CAMBIO CLAVE 2: Iterar sobre todos los archivos y crear una parte para cada uno
    uploadedFiles.forEach(file => {
      if (file && file.filepath) {
        const imageBase64 = fs.readFileSync(file.filepath).toString('base64');
        prompt.push({
          inlineData: {
            data: imageBase64,
            mimeType: file.mimetype,
          },
        });
      }
    });

    // 3. Añadir el prompt de texto al final del array
    prompt.push(`Eres un tutor experto. Basándote en el contenido de todas las imágenes proporcionadas, genera un examen en el formato JSON que has estado usando: ${examType}. Asegúrate de que las preguntas cubran la totalidad del material de estudio.`);

    // 4. Llamada a Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: JSON_SCHEMA,
      },
    });

    // 5. Devolver la Respuesta
    const examenJSON = JSON.parse(response.text.trim());
    
    return res.status(200).json(examenJSON);

  } catch (apiError) {
    console.error('Error en la API de Gemini:', apiError);
    return res.status(500).json({ 
        error: 'Error al procesar la solicitud con Gemini. Revisa los logs de Vercel.',
        details: apiError.message
    });
  } finally {
    // CAMBIO CLAVE 3: Limpiar todos los archivos subidos temporalmente
    uploadedFiles.forEach(file => {
      if (file && file.filepath) {
        fs.unlinkSync(file.filepath);
      }
    });
  }
}