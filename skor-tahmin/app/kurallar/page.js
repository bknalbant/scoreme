'use client';

const box = {
  background: 'var(--pitch-2)', border: '1px solid var(--line)',
  borderRadius: 10, padding: '16px 18px', marginBottom: 12,
  fontSize: 14, lineHeight: 1.65, color: 'var(--chalk)'
};
const em = { color: 'var(--amber)', fontWeight: 600 };
const dim = { color: 'var(--muted)' };

function Row({ pts, cls, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '6px 0' }}>
      <span className={`points ${cls}`} style={{ flexShrink: 0, minWidth: 34, textAlign: 'center' }}>
        {pts}
      </span>
      <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}

export default function KurallarPage() {
  return (
    <>
      <div className="day-header">Nasıl oynanır?</div>
      <div style={box}>
        Her maç için, maç başlamadan önce bir skor tahmini girersin. Maç başladığı anda
        tahminler <span style={em}>kilitlenir</span> — artık değiştirilemez. Maç bitince
        sonuç otomatik olarak sisteme düşer, puanın hesaplanır ve sıralamaya işlenir.
        Tahminini maç saatine kadar istediğin kadar güncelleyebilirsin.
      </div>

      <div className="day-header">Maç puanlaması</div>
      <div style={box}>
        <Row pts="+4" cls="p4">
          <strong>Tam skor.</strong> Skoru birebir bildin.
          <span style={dim}> Örn: tahmin 2–1, sonuç 2–1.</span>
        </Row>
        <Row pts="+3" cls="p3">
          <strong>Doğru gol farkı.</strong> Kazananı ve gol farkını bildin ama skor
          birebir tutmadı.
          <span style={dim}> Örn: tahmin 2–1 (fark +1), sonuç 3–2 (fark +1).</span>
        </Row>
        <Row pts="+2" cls="p2">
          <strong>Doğru sonuç.</strong> Kazananı bildin ama gol farkı tutmadı.
          <span style={dim}> Örn: tahmin 2–0, sonuç 1–0.</span>
        </Row>
        <Row pts="0" cls="p0">
          <strong>Yanlış taraf.</strong> Kazananı (veya beraberliği) bilemedin.
          <span style={dim}> Örn: tahmin 2–1, sonuç 0–1.</span>
        </Row>
      </div>

      <div className="day-header">Beraberlik kuralı</div>
      <div style={box}>
        Beraberlik oynadıysan iki ihtimal var: skoru birebir bildiysen{' '}
        <span style={em}>+4</span> <span style={dim}>(örn. tahmin 1–1, sonuç 1–1)</span>,
        maç farklı bir skorla berabere bittiyse <span style={em}>+2</span>{' '}
        <span style={dim}>(örn. tahmin 1–1, sonuç 2–2)</span>. Beraberlikte gol farkı
        kuralı uygulanmaz — çünkü her beraberliğin farkı zaten sıfırdır, uygulansaydı her
        beraberlik tahmini otomatik +3 olurdu.
      </div>

      <div className="day-header">Gizlilik ve kilit</div>
      <div style={box}>
        Maç başlayana kadar kimse kimsenin tahminini göremez — sadece kimin tahmin girdiği{' '}
        <span style={em}>*–*</span> işaretiyle görünür. Maç başladığı anda herkesin
        tahmini maç kartının altında açılır; maç bitince yanlarına kazanılan puanlar
        eklenir. Bu kural veritabanı seviyesinde uygulanır, yani kopya çekmenin teknik bir
        yolu yoktur. 😄
      </div>

      <div className="day-header">Canlı maçlar ve geçici puanlar</div>
      <div style={box}>
        Maç sürerken puan tablosunda toplam puanının yanında italik bir{' '}
        <span style={em}>+X</span> görebilirsin: bu, canlı maçın o anki skoruna göre
        &quot;maç böyle biterse&quot; alacağın geçici puandır. Skor değiştikçe değişir,
        maç bitince kesinleşip toplamına işlenir. Sıralama geçici puanlar dahil edilerek
        yapılır. <span style={dim}>Not: canlı skorlar veri kaynağımızda gecikmeli
        yayınlanır; skorun birkaç dakika geriden gelmesi normaldir. Kesin sonuç ve puanlar
        maç bitiminde her zaman doğru işlenir.</span>
      </div>

      <div className="day-header">Bonus tahminler</div>
      <div style={box}>
        Maç tahminlerinin yanında bir de turnuva geneli bonus tahminleri var. Bonus
        sayfasından 8 çeyrek finalist, onların arasından 4 yarı finalist ve onların
        arasından şampiyonunu seçersin; ayrıca gol kralını ve turnuvada en çok gol atacak
        takımı tahmin edersin. Puanlar: doğru çeyrek finalist başına{' '}
        <span style={em}>+2</span>, doğru yarı finalist başına <span style={em}>+3</span>,
        şampiyon <span style={em}>+10</span>, gol kralı <span style={em}>+6</span>, en
        golcü takım <span style={em}>+4</span>. Bonus tahminler ilk son 16 maçının
        başlama anında kilitlenir ve o andan itibaren herkese görünür. Gol kralı ve en
        golcü takım puanları turnuva bitiminde kesinleşir; birden fazla oyuncu/takım
        zirveyi paylaşırsa, herhangi birini bilen puanı alır.
      </div>

      <div className="day-header">Sıralama</div>
      <div style={box}>
        Sıralama toplam puana göre yapılır: maç puanları + bonus puanları (+ varsa canlı
        geçici puanlar). Eşitlik durumunda daha fazla <span style={em}>tam skor</span>{' '}
        bilen üstte yer alır. Turnuva sonunda en üstteki isim şampiyondur — ödülünü
        grup içinde kendiniz belirlersiniz. 🏆
      </div>
    </>
  );
}
