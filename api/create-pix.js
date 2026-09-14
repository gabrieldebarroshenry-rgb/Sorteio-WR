// api/create-pix.js
// Gera um PIX único (Mercado Pago) para um número do sorteio e já reserva
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

  // Cria o pagamento PIX no Mercado Pago
  let payment;
  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${number}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: PRICE,
        description: `Sorteio WR DO CORTE - número ${number}`,
        payment_method_id: 'pix',
        payer: { email: 'comprador@sorteio.com', first_name: name },
        external_reference: number,
        notification_url: `${process.env.PUBLIC_URL}/api/webhook`
      })
    });
    payment = await mpRes.json();
    if (!mpRes.ok) {
      console.error('Erro Mercado Pago:', payment);
      return res.status(502).json({ error: 'Erro ao gerar o PIX no Mercado Pago' });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro de conexão com o Mercado Pago' });
  }

  // Reserva o número no Firebase, já vinculado ao pagamento gerado
  await setDoc(
    docRef,
    {
      [number]: {
        status: 'aguardando_pagamento',
        name,
        contact,
        paymentId: payment.id,
        reservedAt: Date.now()
      }
    },
    { merge: true }
  );

  return res.status(200).json({
    paymentId: payment.id,
    copiaCola: payment.point_of_interaction?.transaction_data?.qr_code
  });
}
