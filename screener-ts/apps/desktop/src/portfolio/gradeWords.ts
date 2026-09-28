/**
 * The words for the conviction checklist — the copy half of `tradeGrader.ts`.
 *
 * Same split as `planWords.ts`: core returns criterion KEYS and leaves the sentences to
 * the app, so the checklist can be read in either language without the scoring knowing
 * which one. Every label is phrased as a claim that is either true or false about the
 * chart in front of the user, because a criterion they cannot check is a criterion they
 * will tick out of politeness.
 *
 * ── WHY THE LABELS CARRY THE NUMBER ─────────────────────────────────────────
 * "Relative strength 80+" rather than "strong relative strength". The threshold is the
 * criterion; hiding it would leave the user unable to tell whether a red cross is a
 * verdict about their stock or a disagreement with the rule. The numbers here have to
 * stay in step with `GRADE_BARS`, and `gradeWords.test.ts` checks that they do.
 */
import { GRADE_BARS, type GradeGroup } from '@screener/core';

/** `[vi, en]`, like every other table in this folder. */
type Pair = [string, string];

const B = GRADE_BARS;

export const CRITERION_LABEL: Record<string, Pair> = {
  // ── The market ──
  regimeUptrend: ['Chỉ số đang trong xu hướng tăng đã xác nhận', 'The index is in a confirmed uptrend'],
  regimeNotHostile: ['Chỉ số không trong xu hướng giảm', 'The index is not in a downtrend'],

  // ── Trend template ──
  aboveMa50: ['Giá trên MA50', 'Price above the 50-day average'],
  maStack: ['MA50 > MA150 > MA200 (xếp đúng thứ tự)', 'MA50 > MA150 > MA200, in that order'],
  ma200Rising: ['MA200 đang đi lên', 'The 200-day average is rising'],
  near52wHigh: [
    `Cách đỉnh 52 tuần không quá ${B.NEAR_HIGH_PCT}%`,
    `Within ${B.NEAR_HIGH_PCT}% of the 52-week high`,
  ],

  // ── Leadership ──
  rsStrong: [`Sức mạnh tương đối từ ${B.RS_STRONG} trở lên`, `Relative strength ${B.RS_STRONG}+`],
  rsElite: [`Sức mạnh tương đối từ ${B.RS_ELITE} trở lên`, `Relative strength ${B.RS_ELITE}+`],

  // ── The base ──
  contractions: [
    `Có ít nhất ${B.MIN_CONTRACTIONS} lần nén thu hẹp dần`,
    `At least ${B.MIN_CONTRACTIONS} contracting pullbacks`,
  ],
  baseTight: [`Nền sâu không quá ${B.MAX_BASE_DEPTH_PCT}%`, `Base no deeper than ${B.MAX_BASE_DEPTH_PCT}%`],
  atrContracting: [
    `Biên độ (ATR) co lại ít nhất ${B.MIN_ATR_CONTRACTION_PCT}% trong nền`,
    `Range (ATR) contracted at least ${B.MIN_ATR_CONTRACTION_PCT}% across the base`,
  ],
  noOverheadSupply: [
    'Không có vùng kẹt hàng nặng ngay phía trên',
    'No heavy overhead supply just above',
  ],

  // ── Demand ──
  volumeDryUp: [
    `Khối lượng cạn dần ít nhất ${B.MIN_VOLUME_DRYUP_PCT}% vào điểm mua`,
    `Volume dried up at least ${B.MIN_VOLUME_DRYUP_PCT}% into the pivot`,
  ],

  // ── The gap ──
  gapSize: [`Nhảy khoảng từ ${B.MIN_GAP_PCT}% trở lên`, `Gapped ${B.MIN_GAP_PCT}% or more`],
  gapVolume: [
    `Khối lượng ngày nhảy khoảng gấp ${B.MIN_EP_RVOL} lần trung bình`,
    `Gap-day volume ${B.MIN_EP_RVOL}× its average`,
  ],
  closedStrong: [
    'Đóng cửa ở nửa trên của biên độ ngày nhảy khoảng',
    'Closed in the upper half of the gap day’s range',
  ],
  clearedResistance: ['Nhảy vượt qua vùng kháng cự trước đó', 'Gapped clear of the prior resistance'],
  catalyst: ['Có nguyên nhân rõ ràng (kết quả kinh doanh, tin)', 'A named cause (earnings, news)'],

  // ── Momentum ──
  priorAdvance: [
    `Đã tăng ít nhất ${B.MIN_PRIOR_ADVANCE_PCT}% trước khi tạo nền`,
    `Advanced at least ${B.MIN_PRIOR_ADVANCE_PCT}% before the base`,
  ],

  // ── Liquidity ──
  liquid: [
    `Giá trị giao dịch trung bình từ ${B.MIN_DOLLAR_VOLUME / 1_000_000} triệu $/ngày`,
    `At least $${B.MIN_DOLLAR_VOLUME / 1_000_000}M traded per day`,
  ],

  // ── This trade's mechanics ──
  rrOk: [`Lãi/lỗ kỳ vọng từ ${B.MIN_RR}R trở lên`, `Reward-to-risk of ${B.MIN_RR}R or better`],
  stopSane: [`Cắt lỗ cách điểm vào không quá ${B.MAX_STOP_PCT}%`, `Stop within ${B.MAX_STOP_PCT}% of the entry`],
  earningsClear: [
    'Không có ngày báo cáo trong thời gian dự định giữ',
    'No earnings date inside the intended holding window',
  ],

  // ── The fundamentals ──
  epsGrowth: ['Lợi nhuận và doanh thu đang tăng tốc', 'Earnings and sales are accelerating'],
  groupLeader: ['Thuộc nhóm ngành đang dẫn dắt', 'In a leading industry group'],
  institutional: ['Có dấu hiệu tổ chức đang gom', 'Signs of institutional accumulation'],
};

export function criterionLabel(key: string, vi: boolean): string {
  const p = CRITERION_LABEL[key];
  // The key itself, not an empty string: a checklist row with no words is a bug the user
  // cannot report, whereas a raw key is one they can quote.
  if (!p) return key;
  return vi ? p[0] : p[1];
}

/**
 * What each criterion MEANS, and why anyone thought it was worth points.
 *
 * ── WHY THIS IS SEPARATE FROM THE LABEL ─────────────────────────────────────
 * The label is a claim to tick; this is the reason to believe it. They are different
 * lengths and they appear in different places — the label goes in a checklist row that
 * must stay scannable, this goes in the Learn book and in the row's expanded detail. Folding
 * them together would force every checklist row to carry a paragraph, and the reliable
 * result of a checklist that takes ten minutes to read is a user who stops reading it.
 *
 * ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
 * A criterion whose reason the user does not know is a criterion they cannot ever disagree
 * with on purpose. They will tick it to make the grade go up, or override the grade to make
 * the number go away — and in both cases the checklist has stopped measuring anything. The
 * point of writing the reason down is that it can be ARGUED WITH: after fifty trades the
 * user should be able to say "this one never predicted anything for me" and turn the
 * threshold down, which is a different act from ignoring it.
 *
 * Each entry says what to look at, then why it matters. Not "this is important" — what
 * goes wrong when it is false.
 */
export const CRITERION_WHY: Record<string, Pair> = {
  // ── The market ──
  regimeUptrend: [
    'Phần lớn cổ phiếu đi theo chỉ số. Cùng một nền VCP hoàn hảo, mua trong xu hướng tăng thì chạy, mua trong xu hướng giảm thì thất bại — không phải vì mẫu hình sai, mà vì thị trường rút thanh khoản khỏi mọi thứ cùng lúc. Đây là tiêu chí duy nhất không nói gì về cổ phiếu của bạn, và là tiêu chí O’Neil đặt lên đầu: ông thống kê rằng ba phần tư số lần đột phá thất bại xảy ra khi chỉ số đang điều chỉnh.',
    'Most stocks follow the index. The same flawless VCP works in an uptrend and fails in a downtrend — not because the pattern was wrong, but because the market withdraws liquidity from everything at once. This is the only criterion that says nothing about your stock, and it is the one O’Neil put first: he found that three quarters of failed breakouts happen while the index is correcting.',
  ],
  regimeNotHostile: [
    'Nhẹ hơn tiêu chí trên, và có lý do riêng: giữa "đã xác nhận tăng" và "đang giảm" còn một vùng lưỡng lự, nơi vẫn có thể giao dịch với kích thước nhỏ. Tách làm hai giúp bạn phân biệt "chưa tốt" với "đừng mua" — gộp lại thì một phiên đi ngang trông y như một phiên sụp.',
    'The softer half of the one above, and it earns its own row: between "confirmed uptrend" and "downtrend" lies an undecided stretch where a smaller position is still reasonable. Splitting them lets you tell "not yet good" from "do not buy" — merged, a flat tape looks identical to a collapsing one.',
  ],

  // ── Trend template ──
  aboveMa50: [
    'Giá trên MA50 nghĩa là người mua trong hai tháng rưỡi qua đang có lời. Dưới MA50 thì mỗi nhịp hồi đều gặp một hàng người muốn về bờ, và lực bán đó không đến từ tin xấu nào cả — nó chỉ là số học của những vị thế đang lỗ.',
    'Price above the 50-day means buyers from the last two and a half months are in profit. Below it, every rally runs into a queue of people wanting to get out at cost, and that selling comes from no piece of bad news at all — it is just the arithmetic of underwater positions.',
  ],
  maStack: [
    'Thứ tự MA50 > MA150 > MA200 là cách đọc một xu hướng dài bằng ba khung thời gian cùng lúc: trung bình ngắn trên trung bình dài, ở mọi tầng. Đây là điều kiện của Weinstein cho "stage 2" — giai đoạn duy nhất ông cho là nên mua. Khi thứ tự bị đảo, cổ phiếu chưa chắc giảm, nhưng nó đã không còn là cổ phiếu đang trong đà tăng, và cả quyển sách này viết về cổ phiếu đang trong đà tăng.',
    'The order MA50 > MA150 > MA200 reads a long trend through three time frames at once: the shorter average above the longer one, at every level. This is Weinstein’s condition for "stage 2" — the only stage he thought worth buying. When the order breaks, the stock is not necessarily falling, but it has stopped being a stock in an uptrend, and this entire book is about stocks in uptrends.',
  ],
  ma200Rising: [
    'MA200 đi lên là định nghĩa gọn nhất của "xu hướng dài hạn còn nguyên". Nó chậm, và đó là điểm mạnh: nó không đổi ý vì một tuần xấu, nên khi nó quay đầu thì điều đã thay đổi là chuyện lớn, không phải nhiễu.',
    'A rising 200-day is the most compact definition of "the long trend is intact". It is slow, and that is the point: it does not change its mind over one bad week, so when it does turn, what changed is something real rather than noise.',
  ],
  near52wHigh: [
    `Nghịch lý mà ai mới cũng thấy khó chịu: mua gần đỉnh an toàn hơn mua xa đỉnh. Ở gần đỉnh 52 tuần thì hầu như không còn ai đang lỗ để chờ bán ra — không có "hàng kẹt" phía trên. Cách đỉnh 40% thì mọi nhịp tăng đều phải đi qua từng lớp người muốn thoát ở giá cũ. Đây là lý do các nhà giao dịch đà tăng gần như không bao giờ bắt đáy: rẻ không phải là một lợi thế, mà thường là một hàng người bán.`,
    `The paradox every beginner finds uncomfortable: buying near the high is safer than buying far from it. Near the 52-week high almost nobody is holding a loss waiting to sell — there is no supply overhead. Down 40% from the high, every advance has to climb through layer after layer of people wanting out at their old price. This is why momentum traders almost never buy the dip: cheap is not an edge, it is usually a queue of sellers.`,
  ],

  // ── Leadership ──
  rsStrong: [
    `Sức mạnh tương đối so cổ phiếu này với mọi cổ phiếu khác, không so với chính nó. ${B.RS_STRONG} nghĩa là nó đã đi tốt hơn ${B.RS_STRONG}% thị trường trong năm qua. Lý do tiêu chí này có điểm cao nhất bảng: trong các nghiên cứu của O’Neil, đây là con số duy nhất tách được cổ phiếu tăng gấp nhiều lần khỏi phần còn lại TRƯỚC khi nó tăng. Cổ phiếu dẫn dắt vẫn dẫn dắt; nó không luân phiên.`,
    `Relative strength compares this stock to every other stock, not to itself. ${B.RS_STRONG} means it outpaced ${B.RS_STRONG}% of the market over the past year. Why it carries the heaviest weight on the board: across O’Neil’s studies this was the one number that separated the eventual multi-baggers from everything else BEFORE they ran. Leaders keep leading; it does not take turns.`,
  ],
  rsElite: [
    `Điểm cộng chồng lên tiêu chí trên, không thay thế nó. ${B.RS_ELITE}+ là nơi Minervini nói phần lớn cổ phiếu tăng mạnh nhất của ông được tìm thấy. Cho nó điểm riêng để một cổ phiếu ${B.RS_ELITE} không bị xếp ngang với một cổ phiếu vừa đủ ${B.RS_STRONG}: cả hai đều "đạt", nhưng chúng không giống nhau.`,
    `A bonus stacked on the row above, not a replacement for it. ${B.RS_ELITE}+ is where Minervini says most of his biggest winners were found. It scores separately so a ${B.RS_ELITE} stock is not filed alongside one that scraped past ${B.RS_STRONG}: both "pass", and they are not the same stock.`,
  ],

  // ── The base ──
  contractions: [
    `Nén thu hẹp dần nghĩa là mỗi nhịp điều chỉnh trong nền nông hơn nhịp trước: 25%, rồi 12%, rồi 6%. Đó là hình ảnh nhìn thấy được của việc người bán cạn dần — mỗi lần rũ bỏ lại lấy ra được ít cổ phiếu hơn lần trước, vì những tay yếu đã ra hết ở nhịp đầu. ${B.MIN_CONTRACTIONS} lần là mức tối thiểu để gọi đây là một quá trình chứ không phải một nhịp giảm tình cờ. Chỉ hỏi với các setup có nền.`,
    `Contracting pullbacks means each correction inside the base is shallower than the last: 25%, then 12%, then 6%. That is the visible shape of sellers running out — each shakeout shakes fewer shares loose, because the weak hands already left on the first one. ${B.MIN_CONTRACTIONS} is the minimum to call this a process rather than a coincidence. Only asked of base setups.`,
  ],
  baseTight: [
    `Một nền sâu 45% cần một đợt tăng 80% chỉ để về lại đỉnh cũ, và đường đi đó xuyên qua toàn bộ số người đã mua ở trên. Nền nông hơn ${B.MAX_BASE_DEPTH_PCT}% nói rằng cổ phiếu không bị bán tháo, nó chỉ nghỉ. Minervini nói thẳng: nông thắng sâu, và ông thà bỏ một nền hơi chật còn hơn mua một cái hố. Chỉ hỏi với các setup có nền.`,
    `A 45%-deep base needs an 80% advance just to reclaim its old high, and that path runs through everyone who bought above. A base shallower than ${B.MAX_BASE_DEPTH_PCT}% says the stock was not dumped, it rested. Minervini is blunt about it: shallow beats deep, and he would rather pass on a tight base than buy a hole. Only asked of base setups.`,
  ],
  atrContracting: [
    `ATR co lại là cùng một ý với nén thu hẹp, nhưng đo bằng biên độ hằng ngày thay vì bằng các đáy: những ngày cuối nền phải hẹp hơn những ngày đầu nền. Nó bắt được thứ mà việc đếm nhịp bỏ sót — một nền đi ngang nhưng mỗi ngày vẫn dao động 6% thì chưa yên, dù không có nhịp điều chỉnh nào. Chỉ hỏi với các setup có nền.`,
    `Contracting ATR is the same idea as contracting pullbacks measured through daily range instead of through the lows: the last days of the base should be narrower than the first. It catches what counting pullbacks misses — a base that goes sideways while still swinging 6% a day has not settled, however few corrections it made. Only asked of base setups.`,
  ],
  noOverheadSupply: [
    'Hàng kẹt là một vùng giá phía trên nơi từng có rất nhiều cổ phiếu đổi tay — thường là một nền cũ đã vỡ, hoặc một cú sụp sau tin. Những người mua ở đó đã chờ hằng tháng để về bờ, và họ sẽ bán ngay khi được về bờ, bất kể tin tức hôm nay tốt thế nào. Đây là tiêu chí phải tự xem, vì máy không biết phân biệt một đỉnh cũ có khối lượng lớn với một cái nhô ngẫu nhiên. Cách xem: lùi biểu đồ ra hai năm và tìm vùng giá mà nến dày đặc ngay trên điểm mua của bạn.',
    'Overhead supply is a price zone above you where a lot of stock once changed hands — usually a failed base, or a post-news collapse. The people who bought there have waited months to get back to even, and they will sell the moment they can, however good today’s news is. This one is yours to check, because the machine cannot tell a heavy old top from a random spike. How to look: zoom the chart out two years and find the price zone where the candles cluster just above your pivot.',
  ],

  // ── Demand ──
  volumeDryUp: [
    `Khối lượng cạn vào điểm mua là dấu hiệu tinh vi nhất trong bảng này, và nó có điểm cao thứ hai. Giá đi ngang mà khối lượng rơi về mức thấp nhất nhiều tuần nghĩa là không còn ai muốn bán ở giá này nữa — không phải người mua đã mạnh lên, mà người bán đã hết. Từ trạng thái đó, một lượng cầu vừa phải cũng đủ đẩy giá đi, vì không còn gì chặn lại. Ngược lại, một nền có khối lượng cao đều đặn là một nền vẫn đang có người phân phối. Chỉ hỏi với các setup có nền.`,
    `Volume drying up into the pivot is the subtlest signal on this board, and it carries the second-heaviest weight. Price going sideways while volume falls to multi-week lows means nobody wants to sell here any more — not that buyers got stronger, but that sellers ran out. From there, ordinary demand is enough to move price, because nothing is standing in the way. The opposite, a base with steadily heavy volume, is a base someone is still distributing into. Only asked of base setups.`,
  ],

  // ── The gap ──
  gapSize: [
    `Với setup episodic pivot, khoảng nhảy CHÍNH LÀ setup. Nhảy từ ${B.MIN_GAP_PCT}% trở lên nghĩa là tin tức lớn đến mức giá cũ không còn liên quan — không ai kịp mua ở giữa, nên không có hàng kẹt trong vùng đó. Nhảy 3% chỉ là một ngày tăng tốt; nó không tạo ra sự đứt gãy mà cả luận điểm dựa vào. Chỉ hỏi với EP và Surge.`,
    `For an episodic pivot the gap IS the setup. A gap of ${B.MIN_GAP_PCT}% or more means the news was large enough that the old price stopped being relevant — nobody got to trade through that range, so no supply sits inside it. A 3% gap is just a good up day; it does not create the discontinuity the whole thesis rests on. Only asked of EP and Surge.`,
  ],
  gapVolume: [
    `Khoảng nhảy không có khối lượng là một khoảng nhảy sẽ được lấp. Khối lượng gấp ${B.MIN_EP_RVOL} lần trung bình là bằng chứng rằng tổ chức đang mua vào tin đó, chứ không phải vài lệnh nhỏ trước giờ mở cửa đẩy giá lên rồi bỏ đi. Đây là tiêu chí có điểm cao nhất trong nhóm ngày nhảy khoảng, vì nó phân biệt một sự kiện với một cái nhô. Chỉ hỏi với EP và Surge.`,
    `A gap without volume is a gap that gets filled. Volume at ${B.MIN_EP_RVOL}× its average is evidence that institutions are buying the news, rather than a few pre-market orders lifting the price and walking away. It is the heaviest row in the gap group because it is what separates an event from a spike. Only asked of EP and Surge.`,
  ],
  closedStrong: [
    'Đóng cửa ở nửa trên biên độ ngày nhảy khoảng cho biết ai thắng trong chính ngày đó. Nhảy lên rồi bị bán về đáy phiên nghĩa là có người dùng tin tốt để thoát hàng — bạn thấy tin, họ thấy thanh khoản. Giữ được gần đỉnh phiên nghĩa là cầu vẫn còn sau khi những người muốn bán đã bán xong. Chỉ hỏi với EP và Surge.',
    'Closing in the upper half of the gap day’s range tells you who won the day itself. Gapping up and then selling off to the low means someone used the good news to get out — you saw news, they saw liquidity. Holding near the high means demand was still there after everyone who wanted to sell had sold. Only asked of EP and Surge.',
  ],
  clearedResistance: [
    'Một khoảng nhảy vượt hẳn qua đỉnh cũ thì xoá sổ hàng kẹt thay vì đâm vào nó. Cùng một khoảng nhảy 12%, nếu nó dừng ngay dưới một đỉnh cũ có khối lượng lớn thì bạn đang mua vào đúng chỗ người khác chờ để bán. Đây là lý do vị trí của khoảng nhảy quan trọng không kém độ lớn của nó. Chỉ hỏi với EP và Surge.',
    'A gap that clears the old high erases overhead supply instead of running into it. The same 12% gap, if it stops just under a heavy prior top, has you buying exactly where other people are waiting to sell. This is why where the gap lands matters as much as how big it is. Only asked of EP and Surge.',
  ],
  catalyst: [
    'Nguyên nhân có tên — kết quả kinh doanh, một hợp đồng, một lần được cấp phép — là điều khiến khoảng nhảy có khả năng bền. Nó trả lời câu "vì sao đúng hôm nay", và nó cho bạn một thứ để theo dõi sau khi vào: nếu luận điểm là "lợi nhuận vượt kỳ vọng mạnh" thì quý sau bạn biết phải kiểm tra cái gì. Một khoảng nhảy không có nguyên nhân thường là ép bán khống, và nó lấp lại nhanh như khi nó xuất hiện. Chỉ hỏi với EP và Surge.',
    'A named cause — earnings, a contract, an approval — is what gives a gap a chance of lasting. It answers "why today", and it gives you something to track after you are in: if the thesis is "a big earnings beat", you know what to check next quarter. A gap with no cause is usually a short squeeze, and it fills as fast as it came. Only asked of EP and Surge.',
  ],

  // ── Momentum ──
  priorAdvance: [
    `Qullamaggie tìm đà tăng TRƯỚC, mẫu hình sau: ông chỉ xét những cổ phiếu đã tăng ${B.MIN_PRIOR_ADVANCE_PCT}%+ trong vài tháng qua, rồi mới tìm nền trong số đó. Lý do là một nền chỉ có nghĩa khi nó là nghỉ giữa một đợt tăng; cùng hình dạng đó trên một cổ phiếu đi ngang hai năm không phải là sự tích luỹ, mà là sự thờ ơ. Đợt tăng trước cũng là bằng chứng đã có người lớn muốn cổ phiếu này.

Chỉ hỏi với các setup có nền, và đây là một giới hạn thật của ứng dụng chứ không phải chủ ý: con số đợt tăng trước được lấy ra từ bộ đo nền, nên EP không có nó — dù chính Qullamaggie vẫn đòi đà tăng trước ở cả EP. Với một EP, hãy tự nhìn xem cổ phiếu đã tăng mạnh trước ngày nhảy khoảng hay chưa.`,
    `Qullamaggie looks for momentum FIRST and the pattern second: he only considers stocks already up ${B.MIN_PRIOR_ADVANCE_PCT}%+ over the past few months, then hunts for bases among those. The reason is that a base only means something when it is a rest inside an advance; the identical shape on a stock that has gone sideways for two years is not accumulation, it is indifference. The prior advance is also evidence that someone large already wants this stock.

Only asked of base setups, and that is a real limitation of this app rather than a considered choice: the prior-advance number comes out of the base detector, so an EP never has one — even though Qullamaggie wants the prior advance on EPs just as much. On an EP, check by eye whether the stock had already run before the gap.`,
  ],

  // ── Liquidity ──
  liquid: [
    `Thanh khoản không phải là một tiêu chí về chất lượng, nó là một điều kiện để thoát ra. Dưới ${B.MIN_DOLLAR_VOLUME / 1_000_000} triệu $/ngày, lệnh cắt lỗ của bạn tự nó làm giá xấu đi, và tổ chức — tức là nguồn cầu mà cả luận điểm trông chờ — không thể mua vào mà không tự đẩy giá lên. Qullamaggie coi đây là ngưỡng cứng, không phải điểm cộng: một mẫu hình hoàn hảo trên một cổ phiếu không ai giao dịch vẫn là một cái bẫy.`,
    `Liquidity is not a quality criterion, it is an exit condition. Below $${B.MIN_DOLLAR_VOLUME / 1_000_000}M a day, your own stop makes the price worse, and institutions — the very demand the thesis depends on — cannot buy without lifting the price themselves. Qullamaggie treats this as a hard floor rather than a bonus: a perfect pattern on a stock nobody trades is still a trap.`,
  ],

  // ── This trade's mechanics ──
  rrOk: [
    `Lãi/lỗ kỳ vọng là tiêu chí duy nhất đo QUYẾT ĐỊNH của bạn thay vì đo cổ phiếu, và nó không nói gì về mẫu hình: nó nói rằng ở mức giá vào lúc này, mục tiêu này và cắt lỗ này, phần thưởng có xứng với rủi ro không. Dưới ${B.MIN_RR}R thì bạn cần thắng quá nửa số lần chỉ để hoà — điều mà không ai trong quyển sách này làm được. Đây cũng là tiêu chí bạn sửa được ngay: đợi giá về gần điểm mua hơn thì con số này tự tốt lên.`,
    `Reward-to-risk is the only criterion that measures your DECISION rather than the stock, and it says nothing about the pattern: it says that at this entry, this target and this stop, the payoff is worth the risk. Under ${B.MIN_RR}R you need to be right more than half the time just to break even — which nobody in this book manages. It is also the one row you can fix on the spot: waiting for a price closer to the pivot improves it by itself.`,
  ],
  stopSane: [
    `Cắt lỗ quá xa không phải là cho cổ phiếu chỗ thở, nó là thừa nhận bạn không biết mình sai ở đâu. Quá ${B.MAX_STOP_PCT}% thường nghĩa là điểm vào cách cấu trúc quá xa — đã đuổi giá — nên chỗ duy nhất đặt cắt lỗ hợp lý lại ở rất sâu. Cách sửa gần như luôn là vào ở giá tốt hơn, không phải nới cắt lỗ ra. Lưu ý cắt lỗ vẫn phải đặt theo cấu trúc biểu đồ; con số này chỉ là ngưỡng báo rằng cấu trúc đó đang ở quá xa.`,
    `A very wide stop is not giving the stock room, it is admitting you do not know where you are wrong. Beyond ${B.MAX_STOP_PCT}% usually means the entry sits too far from structure — you chased — so the only sensible stop is a long way down. The fix is almost always a better entry, not a looser stop. The stop itself still belongs at a structural level; this number is only the alarm that the structure is too far away.`,
  ],
  earningsClear: [
    'Báo cáo kết quả kinh doanh là một khoảng nhảy hai chiều mà không mẫu hình nào dự đoán được, và cắt lỗ không bảo vệ bạn qua nó: giá mở cửa thấp hơn mức cắt lỗ thì bạn thoát ở giá đó, không phải ở giá mình đặt. Minervini không giữ một vị thế MỚI qua ngày báo cáo, vì nó biến một giao dịch đã tính toán rủi ro thành một lần tung đồng xu. Không có nghĩa là không bao giờ mua trước báo cáo — chỉ là hãy biết mình đang làm thế, và hãy mua nhỏ hơn. Đây là tiêu chí phải tự điền, vì lịch báo cáo không nằm trong dữ liệu giá.',
    'Earnings is a two-sided gap no pattern predicts, and a stop does not protect you through it: if it opens below your stop you exit there, not where you placed it. Minervini will not hold a NEW position through an earnings date, because it turns a risk-measured trade into a coin flip. This does not mean never buying before earnings — it means knowing that you are, and buying smaller. Yours to fill in, because the earnings calendar is not in the price data.',
  ],

  // ── The fundamentals ──
  epsGrowth: [
    'Tăng tốc, không chỉ tăng: 15% rồi 25% rồi 40% nói một điều khác hẳn với 30% ba quý liền. Tăng tốc là thứ buộc các tổ chức phải sửa mô hình của họ và mua thêm, và dòng tiền đó là cái đẩy giá trong nhiều tháng. Hai chữ C và A trong CAN SLIM của O’Neil chính là ô này. Phải tự điền, vì ứng dụng này không có dữ liệu cơ bản — hãy đọc bảng lợi nhuận quý gần nhất.',
    'Accelerating, not merely growing: 15% then 25% then 40% says something quite different from 30% three quarters running. Acceleration is what forces institutions to revise their models and buy more, and that flow is what moves price for months. The C and the A in O’Neil’s CAN SLIM are this box. Yours to fill in, because this app carries no fundamental data — read the last few quarterly reports.',
  ],
  groupLeader: [
    'Cổ phiếu dẫn dắt hiếm khi đi một mình. Khi dòng tiền vào một ngành, nó nâng vài cái tên cùng lúc — nên một cổ phiếu mạnh trong một ngành mạnh có một lực đẩy mà một cổ phiếu mạnh đơn độc không có. Nó cũng là một phép kiểm tra chéo: nếu không có mã nào khác cùng ngành đi tốt, hãy tự hỏi luận điểm của bạn thật sự nói về cái gì. Cách xem: mở hai hoặc ba mã cùng ngành và so cùng khung thời gian.',
    'Leaders rarely travel alone. When money rotates into a sector it lifts several names at once — so a strong stock in a strong group has a tailwind a strong stock on its own does not. It is also a cross-check: if no other name in the group is working, ask what your thesis is really about. Yours to fill in, because the app does not know which sector a ticker belongs to. How to look: pull up two or three peers and compare the same window.',
  ],
  institutional: [
    'Đà tăng bền đến từ những người mua phải mất nhiều tuần mới mua xong. Dấu hiệu nhìn thấy được là các ngày tăng có khối lượng lớn bất thường trong khi các ngày giảm thì khối lượng cạn — tức là có người gom trên đường lên. Chữ I trong CAN SLIM. Phải tự điền: máy đếm được khối lượng nhưng không đọc được ý định, nên đây là việc của mắt bạn trên biểu đồ.',
    'Durable trends come from buyers who need weeks to finish buying. The visible sign is up days on unusually heavy volume while down days go quiet — someone accumulating on the way up. The I in CAN SLIM. Yours to fill in: the machine can count volume but cannot read intent, so this is your eyes on the chart.',
  ],
};

/** The explanation, or an empty string — callers render nothing rather than a raw key here. */
export function criterionWhy(key: string, vi: boolean): string {
  const p = CRITERION_WHY[key];
  if (!p) return '';
  return vi ? p[0] : p[1];
}

/** What a criterion's `scope` means in words, for the Learn book's per-setup columns. */
export const SCOPE_LABEL: Record<string, Pair> = {
  always: ['Mọi setup', 'Every setup'],
  base: ['Chỉ setup có nền (VCP, Breakout, Pullback)', 'Base setups only (VCP, Breakout, Pullback)'],
  pivot: ['Chỉ setup nhảy khoảng (EP, Surge)', 'Gap setups only (EP, Surge)'],
};

export function scopeLabel(scope: string, vi: boolean): string {
  const p = SCOPE_LABEL[scope];
  if (!p) return scope;
  return vi ? p[0] : p[1];
}

/** Where the answer comes from — the honest version of "why is this box empty". */
export const SOURCE_LABEL: Record<string, Pair> = {
  auto: ['Máy đo từ biểu đồ', 'Measured from the chart'],
  manual: ['Bạn tự trả lời', 'You answer it'],
};

export function sourceLabel(source: string, vi: boolean): string {
  const p = SOURCE_LABEL[source];
  if (!p) return source;
  return vi ? p[0] : p[1];
}

export const GROUP_LABEL: Record<GradeGroup, Pair> = {
  market: ['Thị trường', 'Market'],
  trend: ['Xu hướng', 'Trend'],
  strength: ['Sức mạnh tương đối', 'Relative strength'],
  base: ['Chất lượng nền', 'Base quality'],
  volume: ['Khối lượng', 'Volume'],
  pivot: ['Ngày nhảy khoảng', 'The gap'],
  momentum: ['Đà tăng trước đó', 'Prior advance'],
  liquidity: ['Thanh khoản', 'Liquidity'],
  risk: ['Cơ chế rủi ro', 'Risk mechanics'],
  fundamental: ['Cơ bản', 'Fundamentals'],
};

export function groupLabel(g: GradeGroup, vi: boolean): string {
  return vi ? GROUP_LABEL[g][0] : GROUP_LABEL[g][1];
}
