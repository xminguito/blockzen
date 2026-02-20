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
      self.sendVengeanceChallenge(friendId: friendId, leaderboardId: leaderboardId, message: message, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("challengeComposer") { (score: Int, leaderboardId: String, promise: Promise) in
      self.challengeComposer(leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)
  }

  // MARK: - Top View Controller
  //
  // Walks the presentedViewController chain from the key window's root so
  // we always land on the topmost visible VC.  Skips any VC that is mid-
  // dismiss — UIKit silently drops present() on a VC in that state.

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
      if presented.isBeingDismissed { break }
      top = presented
    }
    gcLog("topViewController: resolved to \(type(of: top!))")
    return top
  }

  // MARK: - Availability Check

  private func ensureGameCenterAvailable(promise: Promise) -> Bool {
    true
  }

  // MARK: - Shared Leaderboard VC Helper
  //
  // Opens GKGameCenterViewController scoped to a specific leaderboard.
  // Used as fallback when the player has no submitted entry yet (so
  // GKLeaderboard.Entry.challengeComposeController cannot be called).

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
    gcLog("presentLeaderboardVC: leaderboard=\(leaderboardId) scope=\(playerScope.rawValue)")
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

    gcLog("authenticate: setting authenticateHandler")
    let errCancelled = errorCodeUserCancelled
    let errUnavailable = errorCodeUnavailable
    localPlayer.authenticateHandler = { [weak self] viewController, error in
      gcLog("authenticateHandler: vc=\(viewController != nil), error=\(error?.localizedDescription ?? "nil"), isAuth=\(localPlayer.isAuthenticated)")
      DispatchQueue.main.async {
        if let vc = viewController {
          gcLog("authenticateHandler: presenting sign-in VC")
          self?.topViewController()?.present(vc, animated: true)
        } else if let error = error as NSError? {
          gcLog("authenticateHandler: error \(error.domain) \(error.code) — \(error.localizedDescription)")
          let errMsg = error.localizedDescription.lowercased()
          if error.domain == GKError.errorDomain &&
            (error.code == 9 || errMsg.contains("cancel") || errMsg.contains("denied")) {
            promise.reject(errCancelled, "User cancelled Game Center sign-in")
          } else {
            promise.reject(errUnavailable, error.localizedDescription)
          }
        } else if localPlayer.isAuthenticated {
          gcLog("authenticateHandler: success — \(localPlayer.alias)")
          let result: [String: Any] = [
            "playerId": localPlayer.gamePlayerID,
            "alias": localPlayer.alias
          ]
          promise.resolve(result)
        } else {
          promise.reject(errUnavailable, "Game Center authentication could not be completed")
        }
      }
    }

    GKLeaderboard.loadLeaderboards(IDs: ["blockzen_classic"]) { boards, err in
      gcLog("loadLeaderboards (auth trigger): boards=\(boards?.count ?? 0), err=\(err?.localizedDescription ?? "nil")")
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
        Int(score), context: 0,
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
          gcLog("fetchFriendsScores: loadLeaderboards error: \(error.localizedDescription)")
          promise.reject(errUnavailable, error.localizedDescription)
          return
        }
        guard let board = leaderboards?.first else {
          gcLog("fetchFriendsScores: no board for '\(leaderboardId)'")
          promise.resolve([])
          return
        }
        board.loadEntries(for: .friendsOnly, timeScope: .allTime, range: NSRange(location: 1, length: 25)) { _, entries, _, loadError in
          DispatchQueue.main.async {
            if let loadError = loadError {
              gcLog("fetchFriendsScores: loadEntries error: \(loadError.localizedDescription)")
              promise.reject(errUnavailable, loadError.localizedDescription)
              return
            }
            let items = (entries ?? []).map { entry -> [String: Any] in [
              "rank": entry.rank,
              "score": entry.score,
              "playerId": entry.player.gamePlayerID,
              "alias": entry.player.alias,
              "formattedScore": entry.formattedScore
            ]}
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
    gcLog("presentDashboard: presenting")
    top.present(vc, animated: true)
  }

  // MARK: - Challenge Composer (iOS 14+ — GKLeaderboard.Entry API)
  //
  // Flow:
  //   1. GKLeaderboard.loadLeaderboards — validates the ID against App Store Connect.
  //   2. leaderboard.loadEntries(for: .global, range: 1…100) — fetches the
  //      local player's server-verified GKLeaderboard.Entry (first param).
  //      Using .global with a wide range is the most reliable way to always
  //      receive localEntry even when the player ranks outside the top 25.
  //   3. entry.challengeComposeController(withMessage:players:nil:...)
  //      — players: nil forces Apple's native friend picker, which is the
  //      most compatible path and avoids "Retos no compatibles" errors.
  //   4. Fallback — localEntry == nil → open GKGameCenterViewController.

  private func challengeComposer(leaderboardId: String, promise: Promise) {
    gcLog("challengeComposer: START leaderboardId='\(leaderboardId)'")
    guard ensureGameCenterAvailable(promise: promise) else { return }
    guard GKLocalPlayer.local.isAuthenticated else {
      gcLog("challengeComposer: ERROR — player not authenticated")
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }
    guard let top = topViewController() else {
      gcLog("challengeComposer: ERROR — no top view controller found")
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { [weak self] leaderboards, error in
      guard let self = self else { return }

      if let error = error {
        gcLog("challengeComposer: loadLeaderboards FAILED — \(error.localizedDescription)")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      guard let leaderboard = leaderboards?.first else {
        gcLog("challengeComposer: leaderboard '\(leaderboardId)' NOT FOUND — check App Store Connect > Game Center > Leaderboards ID field")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      gcLog("challengeComposer: leaderboard loaded OK — title='\(leaderboard.title ?? "nil")' baseLeaderboardID='\(leaderboard.baseLeaderboardID)'")

      // .global scope with range 1…100 guarantees localEntry is populated
      // regardless of the player's rank; .allTime avoids empty-week issues.
      leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 100)) { localEntry, _, _, loadError in
        if let loadError = loadError {
          gcLog("challengeComposer: loadEntries ERROR — \(loadError.localizedDescription)")
        }

        DispatchQueue.main.async {
          // CRITICAL DEBUG — confirm entry state before launching VC
          let localId = GKLocalPlayer.local.gamePlayerID
          if let entry = localEntry {
            let entryOwnerId = entry.player.gamePlayerID
            let isLocalPlayer = (entryOwnerId == localId)
            gcLog("challengeComposer: localEntry OK — rank=\(entry.rank) score=\(entry.score) formattedScore='\(entry.formattedScore)' entryPlayerId='\(entryOwnerId)' localPlayerId='\(localId)' isLocalPlayer=\(isLocalPlayer)")
          } else {
            gcLog("challengeComposer: localEntry is NIL — leaderboardId='\(leaderboardId)' localPlayerId='\(localId)' — player has not submitted a score yet (submit via submitScore first). Showing leaderboard fallback.")
            self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
            return
          }

          guard let entry = localEntry else { return }

          gcLog("challengeComposer: presenting challengeComposeController — leaderboardId='\(leaderboardId)' players=nil (native friend picker)")

          // players: nil → Apple opens its own friend selector, which is the
          // most compatible approach and avoids "Retos no compatibles" errors.
          let vc = entry.challengeComposeController(
            withMessage: nil,
            players: nil,
            completionHandler: { composeVC, didIssue, recipients in
              DispatchQueue.main.async {
                gcLog("challengeComposer: compose VC finished — didIssue=\(didIssue) recipients=\(recipients?.count ?? 0)")
                composeVC.presentingViewController?.dismiss(animated: true) {
                  promise.resolve(nil)
                }
              }
            }
          )
          gcLog("challengeComposer: calling top.present — topVC=\(type(of: top))")
          top.present(vc, animated: true)
        }
      }
    }
  }

  // MARK: - Send Vengeance Challenge (iOS 14+ — GKLeaderboard.Entry API)
  //
  // Unified flow identical to challengeComposer:
  //   1. GKLeaderboard.loadLeaderboards — validates the ID.
  //   2. leaderboard.loadEntries(for: .global, range: 1…100) — retrieves
  //      localEntry reliably regardless of rank.
  //   3. entry.challengeComposeController(players: nil) — Apple's native
  //      friend picker handles selection; avoids "Retos no compatibles"
  //      errors caused by passing unresolved/incompatible GKPlayer objects.
  //
  // Note: friendId is kept in the signature to preserve the JS API surface
  // and is included in the pre-filled message for context.

  private func sendVengeanceChallenge(
    friendId: String,
    leaderboardId: String,
    message: String?,
    promise: Promise
  ) {
    gcLog("sendVengeanceChallenge: START leaderboardId='\(leaderboardId)' friendId='\(friendId)'")
    guard ensureGameCenterAvailable(promise: promise) else { return }
    guard GKLocalPlayer.local.isAuthenticated else {
      gcLog("sendVengeanceChallenge: ERROR — player not authenticated")
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }
    guard let top = topViewController() else {
      gcLog("sendVengeanceChallenge: ERROR — no top view controller found")
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { [weak self] leaderboards, error in
      guard let self = self else { return }

      if let error = error {
        gcLog("sendVengeanceChallenge: loadLeaderboards FAILED — \(error.localizedDescription)")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      guard let leaderboard = leaderboards?.first else {
        gcLog("sendVengeanceChallenge: leaderboard '\(leaderboardId)' NOT FOUND — check App Store Connect ID")
        DispatchQueue.main.async {
          self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
        }
        return
      }

      gcLog("sendVengeanceChallenge: leaderboard loaded OK — title='\(leaderboard.title ?? "nil")' baseLeaderboardID='\(leaderboard.baseLeaderboardID)'")

      leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 100)) { localEntry, _, _, loadError in
        if let loadError = loadError {
          gcLog("sendVengeanceChallenge: loadEntries ERROR — \(loadError.localizedDescription)")
        }

        DispatchQueue.main.async {
          // CRITICAL DEBUG — confirm entry state before launching VC
          let localId = GKLocalPlayer.local.gamePlayerID
          if let entry = localEntry {
            let entryOwnerId = entry.player.gamePlayerID
            let isLocalPlayer = (entryOwnerId == localId)
            gcLog("sendVengeanceChallenge: localEntry OK — rank=\(entry.rank) score=\(entry.score) entryPlayerId='\(entryOwnerId)' localPlayerId='\(localId)' isLocalPlayer=\(isLocalPlayer)")
          } else {
            gcLog("sendVengeanceChallenge: localEntry is NIL — leaderboardId='\(leaderboardId)' localPlayerId='\(localId)'. Showing leaderboard fallback.")
            self.presentLeaderboardVC(leaderboardId: leaderboardId, playerScope: .friendsOnly, top: top, promise: promise)
            return
          }

          guard let entry = localEntry else { return }

          let msg = message ?? "¡Bateme! Conseguí \(entry.score) puntos."
          gcLog("sendVengeanceChallenge: presenting challengeComposeController — leaderboardId='\(leaderboardId)' players=nil (native friend picker)")

          // players: nil — forces Apple's native friend selector, which is the
          // most compatible path across all iOS versions (14–17+).
          let vc = entry.challengeComposeController(
            withMessage: msg,
            players: nil,
            completionHandler: { composeVC, didIssue, recipients in
              DispatchQueue.main.async {
                gcLog("sendVengeanceChallenge: compose VC finished — didIssue=\(didIssue) recipients=\(recipients?.count ?? 0)")
                composeVC.presentingViewController?.dismiss(animated: true)
                if didIssue {
                  gcLog("sendVengeanceChallenge: challenge sent successfully")
                  promise.resolve(nil)
                } else {
                  gcLog("sendVengeanceChallenge: user cancelled")
                  promise.reject(self.errorCodeUserCancelled, "User cancelled challenge")
                }
              }
            }
          )
          gcLog("sendVengeanceChallenge: calling top.present — topVC=\(type(of: top))")
          top.present(vc, animated: true)
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
