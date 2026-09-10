// api/webhook.js
// O PagBank chama essa URL sozinho assim que um pedido muda de status.
// Se o pagamento foi aprovado (PAID), marcamos o número como "vendido"
// no Firebase automaticamente - sem o Wesley precisar clicar em nada.

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

const RAFFLE_DOC_PATH = ['sorteios', 'wrdocorte-1000'];
const PAGBANK_ORDERS_URL = 'https://api.pagseguro.com/orders';

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

function findReservedNumber(data, orderId) {
  return Object.entries(data).find(([, entry]) => entry.orderId === orderId)?.[0];
}

export default async function handler(req, res) {
  // O PagBank costuma mandar o id do pedido no corpo da notificação.
  // Se o formato vier diferente, dá pra ajustar aqui depois de ver
  // o payload real chegando (loga no console pra conferir).
  console.log('Webhook recebido:', JSON.stringify(req.body));

  const orderId = req.body?.id || req.body?.order_id || req.body?.notificationCode;

  if (!orderId) {
    return res.status(200).send('sem id de pedido, ignorando');
  }

  try {
    const pbRes = await fetch(`${PAGBANK_ORDERS_URL}/${orderId}`, {
      headers: { Authorization: `Bearer ${process.env.PAGBANK_TOKEN}` }
    });
    const order = await pbRes.json();
    const status = order.charges?.[0]?.status;

    if (status === 'PAID') {
      const db = getDb();
      const docRef = doc(db, ...RAFFLE_DOC_PATH);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : {};

      const number = findReservedNumber(data, orderId);
      if (number && data[number].status !== 'vendido') {
        await setDoc(
          docRef,
          { [number]: { ...data[number], status: 'vendido', confirmedAt: Date.now() } },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.error('Erro no webhook:', e);
  }

  // Sempre responde 200, senão o PagBank fica tentando de novo
  res.status(200).send('ok');
}
