// api/create-pix.js
// Gera um PIX único (PagBank) para um número do sorteio e já reserva
// esse número no Firebase enquanto o pagamento não é confirmado.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDu9cBE5AK7Gsb8gKQEeNxEWj6uicOYBG8",
  authDomain: "rifa-wr.firebaseapp.com",
  projectId: "rifa-wr",
  storageBucket: "rifa-wr.firebasestorage.app",
  messagingSenderId: "604750215640",
  appId: "1:604750215640:web:ce29a0c15aacd46fa29aad"
};

const PRICE = 20;
const RAFFLE_DOC_PATH = ['sorteios', 'wrdocorte-1000'];

// Troque para a URL de sandbox (https://sandbox.api.pagseguro.com/orders)
// enquanto estiver testando com o token de sandbox do PagBank.
const PAGBANK_API_URL = 'https://api.pagseguro.com/orders';

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { number, name, contact } = req.body || {};
  if (!number || !name || !contact) {
    return res.status(400).json({ error: 'Faltam dados: número, nome ou WhatsApp' });
  }

  const db = getDb();
  const docRef = doc(db, ...RAFFLE_DOC_PATH);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};

  if (data[number]) {
    return res.status(409).json({ error: 'Esse número já está reservado ou vendido' });
  }

  // Cria o pedido com PIX no PagBank
  let order;
  try {
    const pbRes = await fetch(PAGBANK_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAGBANK_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reference_id: `numero-${number}-${Date.now()}`,
        customer: { name },
        items: [
          { name: `Sorteio WR DO CORTE - número ${number}`, quantity: 1, unit_amount: PRICE * 100 }
        ],
        qr_codes: [
          { amount: { value: PRICE * 100 } }
        ],
        notification_urls: [`${process.env.PUBLIC_URL}/api/webhook`]
      })
    });
    order = await pbRes.json();
    if (!pbRes.ok) {
      console.error('Erro PagBank:', order);
      return res.status(502).json({ error: 'Erro ao gerar o PIX no PagBank' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro de conexão com o PagBank' });
  }

  const qrCode = order.qr_codes?.[0];
  const copiaCola = qrCode?.text;

  // Reserva o número no Firebase, já vinculado ao pedido gerado
  await setDoc(
    docRef,
    {
      [number]: {
        status: 'aguardando_pagamento',
        name,
        contact,
        orderId: order.id,
        reservedAt: Date.now()
      }
    },
    { merge: true }
  );

  return res.status(200).json({
    orderId: order.id,
    copiaCola
  });
}
