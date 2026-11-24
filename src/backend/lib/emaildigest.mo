import Text "mo:core/Text";
import Common "../types/common";
import Store "../types/store";
import OQ "../types/openingquestions";

/// Builds the short, plain daily Opening Questions email: the subject naming the
/// store and number, and the body listing only the lines that apply to one
/// recipient. Pure text formatting; the caller decides who receives it.
module {
  /// The subject line, e.g. "Store 975 Opening Questions: 12 need your approval".
  /// `needsApproval` is the recipient's own approval count; when it is zero the
  /// subject falls back to a generic "today's update".
  public func subject(storeInfo : Store.StoreInfo, needsApproval : Nat) : Text {
    let head = "Store " # storeInfo.storeNumber # " Opening Questions: ";
    if (needsApproval > 0) {
      head # needsApproval.toText() # " need your approval";
    } else {
      head # "today's update";
    };
  };

  /// The plain-text body for one recipient. Only the lines that apply are
  /// included: questions needing their approval, open suggestion discussions
  /// they are in, Ready for final (Managing Partner), decisions due (Admin and
  /// Managing Partner), the Finish-by date with days left or overdue, and the
  /// link to the Opening Qs page. `isTest` prepends a test marker.
  public func body(
    _storeInfo : Store.StoreInfo,
    appLink : Text,
    needsApproval : Nat,
    openDiscussions : Nat,
    readyForFinal : Nat,
    decisionsDue : Nat,
    finishBy : OQ.FinishByView,
    isTest : Bool,
  ) : Text {
    var lines : [Text] = [];
    if (isTest) {
      lines := lines.concat(["This is a test of the daily Opening Questions email."]);
    };
    if (needsApproval > 0) {
      lines := lines.concat([needsApproval.toText() # " question" # plural(needsApproval) # " need your approval."]);
    };
    if (openDiscussions > 0) {
      lines := lines.concat([openDiscussions.toText() # " open suggestion discussion" # plural(openDiscussions) # " you are in."]);
    };
    if (readyForFinal > 0) {
      lines := lines.concat([readyForFinal.toText() # " question" # plural(readyForFinal) # " ready for final."]);
    };
    if (decisionsDue > 0) {
      lines := lines.concat([decisionsDue.toText() # " suggestion decision" # plural(decisionsDue) # " due."]);
    };
    switch (finishBy.finishBy) {
      case (?_) {
        if (finishBy.daysOverdue > 0) {
          lines := lines.concat(["Finish by " # dateText(finishBy.finishBy) # " · " # finishBy.daysOverdue.toText() # " day" # plural(finishBy.daysOverdue) # " overdue."]);
        } else if (finishBy.daysLeft > 0) {
          lines := lines.concat(["Finish by " # dateText(finishBy.finishBy) # " · " # finishBy.daysLeft.toText() # " day" # plural(finishBy.daysLeft) # " left."]);
        } else {
          lines := lines.concat(["Finish by " # dateText(finishBy.finishBy) # " · due today."]);
        };
      };
      case null {};
    };
    lines := lines.concat(["Open Opening Qs: " # appLink]);
    lines.values().join("\n");
  };

  /// "s" when the count is not exactly one, else "".
  func plural(n : Nat) : Text {
    if (n == 1) { "" } else { "s" };
  };

  /// A DateOnly (UTC midnight nanoseconds) as "YYYY-MM-DD", or "" when unset.
  func dateText(date : ?Common.DateOnly) : Text {
    switch (date) {
      case (?d) {
        let dayNs : Int = 86_400_000_000_000;
        let days = d / dayNs;
        let (y, m, day) = civilFromDays(days);
        y.toText() # "-" # pad2(m) # "-" # pad2(day);
      };
      case null { "" };
    };
  };

  /// Internal: zero-pad a positive integer to two digits.
  func pad2(n : Int) : Text {
    if (n < 10) { "0" # n.toText() } else { n.toText() };
  };

  /// Internal: civil (year, month, day) from days since the Unix epoch.
  /// Howard Hinnant's civil_from_days algorithm.
  func civilFromDays(days : Int) : (Int, Int, Int) {
    let z = days + 719_468;
    let era = floorDiv(z, 146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) { mp + 3 } else { mp - 9 };
    let year = if (m <= 2) { y + 1 } else { y };
    (year, m, d);
  };

  /// Internal: floor division that works for negative numerators.
  func floorDiv(a : Int, b : Int) : Int {
    let q = a / b;
    if (a % b != 0 and (a < 0) != (b < 0)) { q - 1 } else { q };
  };
};
