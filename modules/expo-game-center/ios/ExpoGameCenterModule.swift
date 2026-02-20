import ExpoModulesCore
import GameKit
import UIKit

// MARK: - Debug Logging
private func gcLog(_ msg: String) {
  #if DEBUG
  print("[ExpoGameCenter] \(msg)")
  #endif
}

public class ExpoGameCenterModule: Module {
  private let errorCodeUnavailable = "E_GAMECENTER_UNAVAILABLE"
  private let errorCodeUserCancelled = "E_GAMECENTER_USER_CANCELLED"
  private var gameCenterDelegateRetainer: GameCenterDelegate?

  public func definition() -> ModuleDefinition {
    Name("ExpoGameCenter")

    AsyncFunction("authenticate") { (promise: Promise) in
      self.authenticate(promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("submitScore") { (score: Int, leaderboardId: String, promise: Promise) in
      self.submitScore(score: Int64(score), leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("fetchFriendsScores") { (leaderboardId: String, promise: Promise) in
      self.fetchFriendsScores(leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("presentDashboard") { (leaderboardId: String?, promise: Promise) in
      self.presentDashboard(leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("sendVengeanceChallenge") { (friendId: String, score: Int, leaderboardId: String, message: String?, promise: Promise) in
      self.sendVengeanceChallenge(friendId: friendId, score: score, leaderboardId: leaderboardId, message: message, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("challengeComposer") { (score: Int, leaderboardId: String, promise: Promise) in
      self.challengeComposer(score: score, leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)
  }

  // MARK: - Availability Check

  private func ensureGameCenterAvailable(promise: Promise) -> Bool {
    true
  }

  // MARK: - Top View Controller
  //
  // Walks the presentedViewController chain from the key window's root so
  // we always land on the topmost visible VC, even if Expo Router or another
  // RN system has pushed an intermediate presented controller.

  private func topViewController() -> UIViewController? {
    guard
      let windowScene = UIApplication.shared.connectedScenes
        .filter({ $0.activationState == .foregroundActive })
        .compactMap({ $0 as? UIWindowScene })
        .first,
      let window = windowScene.windows.first(where: { $0.isKeyWindow })
    else {
      gcLog("topViewController: no active key window found")
      return nil
    }
    var top = window.rootViewController
    while let presented = top?.presentedViewController {
      // Skip view controllers that are being dismissed to avoid presenting
      // on a VC mid-transition (UIKit silently drops present() in that state).
      if presented.isBeingDismissed { break }
      top = presented
    }
    gcLog("topViewController: resolved to \(type(of: top!))")
    return top
  }

  // MARK: - Shared Leaderboard VC Helper
  //
  // Opens GKGameCenterViewController scoped to a specific leaderboard with
  // friends-only ranking. Used as fallback when the deprecated GKScore
  // challenge compose controller is unavailable (returns nil on iOS 17+).

  private func presentLeaderboardVC(
    leaderboardId: String,
    playerScope: GKLeaderboard.PlayerScope,
    top: UIViewController,
    promise: Promise
  ) {
    let delegate = GameCenterDelegate(promise: promise) { [weak self] in
      self?.gameCenterDelegateRetainer = nil
    }
    gameCenterDelegateRetainer = delegate
    let vc = GKGameCenterViewController(
      leaderboardID: leaderboardId,
      playerScope: playerScope,
      timeScope: .allTime
    )
    vc.gameCenterDelegate = delegate
    gcLog("presentLeaderboardVC: presenting leaderboard=\(leaderboardId) scope=\(playerScope.rawValue)")
    top.present(vc, animated: true)
  }

  // MARK: - Authentication

  private func authenticate(promise: Promise) {
    gcLog("authenticate() called")
    guard ensureGameCenterAvailable(promise: promise) else { return }

    let localPlayer = GKLocalPlayer.local

    if localPlayer.isAuthenticated {
      gcLog("authenticate: already authenticated as \(localPlayer.alias)")
      DispatchQueue.main.async {
        let result: [String: Any] = [
          "playerId": localPlayer.gamePlayerID,
          "alias": localPlayer.alias
        ]
        promise.resolve(result)
      }
      return
    }

    gcLog("authenticate: not authenticated, setting handler + triggering loadLeaderboards")
    let errCancelled = errorCodeUserCancelled
    let errUnavailable = errorCodeUnavailable
    localPlayer.authenticateHandler = { [weak self] viewController, error in
      gcLog("authenticateHandler called: vc=\(viewController != nil), error=\(error?.localizedDescription ?? "nil"), isAuth=\(localPlayer.isAuthenticated)")
      DispatchQueue.main.async {
        if let vc = viewController {
          gcLog("authenticateHandler: presenting sign-in VC")
          self?.topViewController()?.present(vc, animated: true)
        } else if let error = error as NSError? {
          gcLog("authenticateHandler: error \(error.domain) \(error.code) - \(error.localizedDescription)")
          let errMsg = error.localizedDescription.lowercased()
          if error.domain == GKError.errorDomain {
            if error.code == 9 || errMsg.contains("cancel") || errMsg.contains("denied") {
              promise.reject(errCancelled, "User cancelled Game Center sign-in")
            } else {
              promise.reject(errUnavailable, error.localizedDescription)
            }
          } else {
            promise.reject(errUnavailable, error.localizedDescription)
          }
        } else if localPlayer.isAuthenticated {
          gcLog("authenticateHandler: success, player=\(localPlayer.alias)")
          let result: [String: Any] = [
            "playerId": localPlayer.gamePlayerID,
            "alias": localPlayer.alias
          ]
          promise.resolve(result)
        } else {
          gcLog("authenticateHandler: unexpected state - not authed")
          promise.reject(errUnavailable, "Game Center authentication could not be completed")
        }
      }
    }

    // Trigger Game Kit to invoke authenticateHandler
    GKLeaderboard.loadLeaderboards(IDs: ["blockzen_classic"]) { boards, err in
      gcLog("loadLeaderboards callback: boards=\(boards?.count ?? 0), error=\(err?.localizedDescription ?? "nil")")
    }
  }

  // MARK: - Submit Score (iOS 14+)

  private func submitScore(score: Int64, leaderboardId: String, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    if #available(iOS 14.0, *) {
      GKLeaderboard.submitScore(
        Int(score),
        context: 0,
        player: GKLocalPlayer.local,
        leaderboardIDs: [leaderboardId]
      ) { error in
        DispatchQueue.main.async {
          if let error = error {
            gcLog("submitScore error: \(error.localizedDescription)")
            promise.reject(self.errorCodeUnavailable, error.localizedDescription)
          } else {
            gcLog("submitScore success")
            promise.resolve(nil)
          }
        }
      }
    } else {
      promise.reject(errorCodeUnavailable, "submitScore requires iOS 14 or later")
    }
  }

  // MARK: - Fetch Friends Scores

  private func fetchFriendsScores(leaderboardId: String, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    let errUnavailable = errorCodeUnavailable
    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { leaderboards, error in
      DispatchQueue.main.async {
        if let error = error {
          gcLog("fetchFriendsScores loadLeaderboards error: \(error.localizedDescription)")
          promise.reject(errUnavailable, error.localizedDescription)
          return
        }

        guard let board = leaderboards?.first else {
          gcLog("fetchFriendsScores: no board for \(leaderboardId)")
          promise.resolve([])
          return
        }

        board.loadEntries(for: .friendsOnly, timeScope: .allTime, range: NSRange(location: 1, length: 25)) { local, entries, totalCount, loadError in
          DispatchQueue.main.async {
            if let loadError = loadError {
              gcLog("fetchFriendsScores loadEntries error: \(loadError.localizedDescription)")
              promise.reject(errUnavailable, loadError.localizedDescription)
              return
            }

            let items = (entries ?? []).map { entry -> [String: Any] in
              [
                "rank": entry.rank,
                "score": entry.score,
                "playerId": entry.player.gamePlayerID,
                "alias": entry.player.alias,
                "formattedScore": entry.formattedScore
              ]
            }
            gcLog("fetchFriendsScores: \(items.count) friends")
            promise.resolve(items)
          }
        }
      }
    }
  }

  // MARK: - Present Dashboard

  private func presentDashboard(leaderboardId: String?, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      gcLog("presentDashboard: not authenticated")
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    guard let top = topViewController() else {
      gcLog("presentDashboard: no top VC")
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    let delegate = GameCenterDelegate(promise: promise) { [weak self] in
      self?.gameCenterDelegateRetainer = nil
    }
    gameCenterDelegateRetainer = delegate

    let vc: GKGameCenterViewController
    if let lid = leaderboardId, !lid.isEmpty {
      vc = GKGameCenterViewController(leaderboardID: lid, playerScope: .global, timeScope: .allTime)
    } else {
      vc = GKGameCenterViewController(state: .leaderboards)
    }
    vc.gameCenterDelegate = delegate

    gcLog("presentDashboard: presenting leaderboard")
    top.present(vc, animated: true)
  }

  // MARK: - Challenge Composer
  //
  // Modern path (iOS 14+):
  //   1. GKLeaderboard.loadLeaderboards — validates the leaderboard ID against
  //      App Store Connect. If the ID is wrong this fails immediately with a
  //      clear log instead of a silent nil.
  //   2. leaderboard.loadEntries — retrieves the player's verified server-side
  //      score (GKLeaderboard.Entry). Using the server score avoids the edge
  //      case where GKScore rejects a locally-computed value.
  //   3. GKScore.challengeComposeController — still functional on iOS 14–16.
  //      If it returns nil (iOS 17+ removes the challenge compose UI from the
  //      framework), we fall back to GKGameCenterViewController with
  //      friendsOnly scope so the user can interact with their friends from
  //      Apple's official leaderboard UI.

  private func challengeComposer(score: Int, leaderboardId: String, promise: Promise) {
    gcLog("challengeComposer: score=\(score), leaderboard=\(leaderboardId)")
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      gcLog("challengeComposer: player not authenticated")
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    guard let top = topViewController() else {
      gcLog("challengeComposer: could not resolve top VC")
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    // Step 1 — Validate leaderboard ID via the modern GKLeaderboard API.
    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { [weak self] leaderboards, error in
      guard let self = self else { return }

      if let error = error {
        gcLog("challengeComposer: loadLeaderboards error: \(error.localizedDescription) — falling back to leaderboard UI")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      guard let leaderboard = leaderboards?.first else {
        // Leaderboard ID mismatch with App Store Connect — log clearly.
        gcLog("challengeComposer: leaderboard '\(leaderboardId)' not found. Verify the ID in App Store Connect > Game Center > Leaderboards — falling back to leaderboard UI")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      // Step 2 — Load the player's verified server-side entry.
      leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 1)) { localEntry, _, _, loadError in
        if let loadError = loadError {
          gcLog("challengeComposer: loadEntries error: \(loadError.localizedDescription)")
        }

        // Prefer the server-verified score; fall back to the passed value.
        let verifiedScore = localEntry?.score ?? score
        gcLog("challengeComposer: verifiedScore=\(verifiedScore), localEntry=\(localEntry != nil ? "found (rank \(localEntry!.rank))" : "nil — player may not have a submitted score yet")")

        DispatchQueue.main.async {
          // Step 3 — Attempt the deprecated-but-functional challenge compose
          // controller.  GKScore is deprecated in iOS 14 but the runtime still
          // honours it on iOS 14–16.  On iOS 17+ the framework removed the
          // challenge sheet; challengeComposeController returns nil, so we
          // fall through to the GKGameCenterViewController fallback.
          let scoreObj = GKScore(leaderboardIdentifier: leaderboardId)
          scoreObj.value = Int64(verifiedScore)
          scoreObj.context = 0

          if let vc = scoreObj.challengeComposeController(
            withPlayers: [],
            message: nil,
            completionHandler: { composeVC, _, _ in
              DispatchQueue.main.async {
                composeVC.presentingViewController?.dismiss(animated: true) {
                  gcLog("challengeComposer: compose VC dismissed")
                  promise.resolve(nil)
                }
              }
            }
          ) {
            gcLog("challengeComposer: GKScore compose VC obtained — presenting")
            top.present(vc, animated: true)
          } else {
            gcLog("challengeComposer: GKScore.challengeComposeController returned nil (iOS 17+) — presenting leaderboard friends view as fallback")
            self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
          }
        }
      }
    }
  }

  // MARK: - Send Vengeance Challenge
  //
  // Same modern flow as challengeComposer: validate ID → load entry → try
  // GKScore compose with pre-selected friend → fall back to leaderboard UI.

  private func sendVengeanceChallenge(
    friendId: String,
    score: Int,
    leaderboardId: String,
    message: String?,
    promise: Promise
  ) {
    gcLog("sendVengeanceChallenge: friendId=\(friendId), score=\(score), leaderboard=\(leaderboardId)")
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      gcLog("sendVengeanceChallenge: player not authenticated")
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    guard let top = topViewController() else {
      gcLog("sendVengeanceChallenge: could not resolve top VC")
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    // Step 1 — Validate leaderboard ID.
    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { [weak self] leaderboards, error in
      guard let self = self else { return }

      if let error = error {
        gcLog("sendVengeanceChallenge: loadLeaderboards error: \(error.localizedDescription) — falling back to leaderboard UI")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      guard let leaderboard = leaderboards?.first else {
        gcLog("sendVengeanceChallenge: leaderboard '\(leaderboardId)' not found — falling back to leaderboard UI")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      // Step 2 — Load the player's verified server-side entry.
      leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 1)) { localEntry, _, _, loadError in
        if let loadError = loadError {
          gcLog("sendVengeanceChallenge: loadEntries error: \(loadError.localizedDescription)")
        }

        let verifiedScore = localEntry?.score ?? score
        gcLog("sendVengeanceChallenge: verifiedScore=\(verifiedScore)")

        DispatchQueue.main.async {
          // Step 3 — Attempt challenge compose with the specific friend pre-selected.
          let scoreObj = GKScore(leaderboardIdentifier: leaderboardId)
          scoreObj.value = Int64(verifiedScore)
          scoreObj.context = 0

          let msg = message ?? "¡Bateme! Conseguí \(verifiedScore) puntos."

          if let vc = scoreObj.challengeComposeController(
            withPlayers: [friendId],
            message: msg,
            completionHandler: { composeVC, didIssue, _ in
              DispatchQueue.main.async {
                composeVC.presentingViewController?.dismiss(animated: true)
                if didIssue {
                  gcLog("sendVengeanceChallenge: challenge sent successfully")
                  promise.resolve(nil)
                } else {
                  gcLog("sendVengeanceChallenge: user cancelled compose sheet")
                  promise.reject(self.errorCodeUserCancelled, "User cancelled challenge")
                }
              }
            }
          ) {
            gcLog("sendVengeanceChallenge: GKScore compose VC obtained — presenting with friend \(friendId) pre-selected")
            top.present(vc, animated: true)
          } else {
            gcLog("sendVengeanceChallenge: GKScore.challengeComposeController returned nil — presenting leaderboard friends view as fallback")
            self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
          }
        }
      }
    }
  }
}

// MARK: - GKGameCenterControllerDelegate

private class GameCenterDelegate: NSObject, GKGameCenterControllerDelegate {
  let promise: Promise
  let onDismiss: (() -> Void)?

  init(promise: Promise, onDismiss: (() -> Void)? = nil) {
    self.promise = promise
    self.onDismiss = onDismiss
  }

  func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
    gameCenterViewController.dismiss(animated: true)
    promise.resolve(nil)
    onDismiss?()
  }
}
